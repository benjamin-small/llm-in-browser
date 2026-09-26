use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use wasm_bindgen::prelude::*;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entity {
    pub id: String,
    pub label: String,
    pub kind: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub properties: BTreeMap<String, String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Fact {
    pub id: String,
    pub subject: String,
    pub predicate: String,
    pub object: Option<String>,
    pub value: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Graph {
    pub schema_version: u32,
    pub dataset_version: String,
    pub name: String,
    pub entities: Vec<Entity>,
    pub facts: Vec<Fact>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Event {
    pub r#type: String,
    pub entity_id: String,
    pub payload: BTreeMap<String, serde_json::Value>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub id: String,
    pub text: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Retrieval {
    pub entity_ids: Vec<String>,
    pub facts: Vec<Evidence>,
    pub ambiguity: Vec<String>,
    pub notice: Option<String>,
}

fn words(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect()
}
fn phrase(text: &[String], candidate: &str) -> bool {
    let candidate = words(candidate);
    !candidate.is_empty() && text.windows(candidate.len()).any(|w| w == candidate)
}
fn valid_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 100
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_:.".contains(&c))
}
fn valid_text(s: &str) -> bool {
    !s.trim().is_empty() && s.len() <= 500 && !s.contains("<|")
}

impl Graph {
    pub fn parse(text: &str) -> Result<Self, String> {
        if text.len() > 5_000_000 {
            return Err("Graph exceeds the 5 MB import limit.".into());
        }
        let graph: Self =
            serde_json::from_str(text).map_err(|e| format!("Invalid graph JSON: {e}"))?;
        if graph.schema_version != 1 {
            return Err("Unsupported schemaVersion; expected 1.".into());
        }
        if !valid_text(&graph.name) || !valid_text(&graph.dataset_version) {
            return Err("Graph name and datasetVersion must be short, nonempty text.".into());
        }
        if graph.entities.is_empty() || graph.entities.len() > 10_000 || graph.facts.len() > 50_000
        {
            return Err("Expected 1–10,000 entities and at most 50,000 facts.".into());
        }
        let mut ids = BTreeSet::new();
        for e in &graph.entities {
            if !valid_id(&e.id) || !ids.insert(e.id.clone()) {
                return Err(format!("Invalid or duplicate entity ID: {}", e.id));
            }
            if !valid_text(&e.label)
                || !valid_text(&e.kind)
                || e.aliases.len() > 30
                || e.aliases.iter().any(|s| !valid_text(s))
                || e.properties.len() > 30
                || e.properties
                    .iter()
                    .any(|(k, v)| !valid_text(k) || !valid_text(v))
            {
                return Err(format!("Invalid labels/properties for {}.", e.id));
            }
        }
        let mut fact_ids = BTreeSet::new();
        for f in &graph.facts {
            if !valid_id(&f.id)
                || !fact_ids.insert(&f.id)
                || !ids.contains(&f.subject)
                || !valid_text(&f.predicate)
            {
                return Err(format!("Invalid fact ID, predicate, or subject: {}", f.id));
            }
            match (&f.object, &f.value) {
                (Some(id), None) if ids.contains(id) => (),
                (None, Some(value)) if valid_text(value) => (),
                _ => {
                    return Err(format!(
                        "Fact {} needs exactly one valid object entity or text value.",
                        f.id
                    ))
                }
            }
        }
        Ok(graph)
    }
    fn label(&self, id: &str) -> &str {
        self.entities
            .iter()
            .find(|e| e.id == id)
            .map(|e| e.label.as_str())
            .unwrap_or("")
    }
    pub fn text(&self, f: &Fact) -> String {
        format!(
            "{} — {}: {}.",
            self.label(&f.subject),
            f.predicate.replace('_', " "),
            f.object
                .as_ref()
                .map(|id| self.label(id))
                .unwrap_or_else(|| f.value.as_deref().unwrap_or(""))
        )
    }
    pub fn retrieve(
        &self,
        query: &str,
        previous: &[String],
        event: Option<&Event>,
    ) -> Result<Retrieval, String> {
        if query.len() > 16_000 {
            return Err("Question exceeds the 16,000-character limit.".into());
        }
        let tokens = words(query);
        let mut matched = BTreeSet::new();
        let mut aliases: BTreeMap<String, Vec<String>> = BTreeMap::new();
        let mut longest = 0;
        for e in &self.entities {
            for name in std::iter::once(&e.label)
                .chain(e.aliases.iter())
                .chain(std::iter::once(&e.id))
            {
                if phrase(&tokens, name) {
                    let n = words(name).len();
                    if n > longest {
                        aliases.clear();
                        longest = n;
                    }
                    if n == longest {
                        aliases
                            .entry(name.to_lowercase())
                            .or_default()
                            .push(e.id.clone());
                    }
                }
            }
        }
        let mut ambiguity = BTreeSet::new();
        for ids in aliases.values() {
            let unique: BTreeSet<_> = ids.iter().cloned().collect();
            if unique.len() > 1 {
                for id in unique {
                    ambiguity.insert(self.label(&id).to_owned());
                }
            } else {
                matched.extend(unique);
            }
        }
        let mut notice = None;
        if let Some(event) = event {
            let entity = self
                .entities
                .iter()
                .find(|e| e.id == event.entity_id)
                .ok_or("Event entityId is not in the graph.")?;
            let (kind, required) = match event.r#type.as_str() {
                "device_alert" => ("equipment", vec!["message", "severity"]),
                "visitor_arrived" => ("room", vec!["visitor", "host"]),
                "stock_low" => ("supply", vec!["remaining"]),
                _ => return Ok(Retrieval { entity_ids: vec![], facts: vec![], ambiguity: vec![], notice: Some(format!("Unsupported event type: {}. Supported types: device_alert, visitor_arrived, stock_low. No action was taken.", event.r#type)) }),
            };
            if entity.kind != kind {
                return Err(format!(
                    "{} requires an entity of kind {kind}.",
                    event.r#type
                ));
            }
            if event.payload.len() != required.len()
                || required.iter().any(|key| !event.payload.contains_key(*key))
            {
                return Err(format!(
                    "{} payload requires exactly: {}.",
                    event.r#type,
                    required.join(", ")
                ));
            }
            for (key, value) in &event.payload {
                if key == "remaining" {
                    if value.as_u64().is_none() {
                        return Err("remaining must be a nonnegative integer.".into());
                    }
                } else if !value.as_str().is_some_and(valid_text) {
                    return Err(format!("{key} must be short, nonempty text."));
                }
            }
            matched.clear();
            matched.insert(entity.id.clone());
            ambiguity.clear();
            notice = Some(format!("Temporary event for {}: {}. This is a notification only; no action or graph change has occurred.", entity.label, serde_json::to_string(event).unwrap()));
        }
        if matched.is_empty()
            && ambiguity.is_empty()
            && event.is_none()
            && tokens.iter().any(|t| {
                ["it", "its", "they", "their", "them", "there", "he", "she"].contains(&t.as_str())
            })
        {
            matched.extend(
                previous
                    .iter()
                    .filter(|id| self.entities.iter().any(|e| &e.id == *id))
                    .take(3)
                    .cloned(),
            );
        }
        if !ambiguity.is_empty() {
            return Ok(Retrieval {
                entity_ids: vec![],
                facts: vec![],
                ambiguity: ambiguity.into_iter().collect(),
                notice,
            });
        }
        let query_words: BTreeSet<_> = tokens
            .iter()
            .filter(|t| {
                ![
                    "the", "a", "is", "of", "in", "at", "for", "to", "what", "who", "how", "does",
                    "and", "are", "tell", "me", "about",
                ]
                .contains(&t.as_str())
            })
            .cloned()
            .collect();
        let mut reached = matched.clone();
        // Two bounded relationship hops; never expand the entire graph through a hub.
        for _ in 0..2 {
            let mut next = reached.clone();
            for f in &self.facts {
                if reached.contains(&f.subject) {
                    if let Some(id) = &f.object {
                        if next.len() < 24 {
                            next.insert(id.clone());
                        }
                    }
                }
            }
            reached = next;
        }
        let mut scored: Vec<_> = self
            .facts
            .iter()
            .filter_map(|f| {
                let direct = matched.contains(&f.subject);
                let inverse = f.object.as_ref().is_some_and(|id| matched.contains(id));
                let text = self.text(f);
                let synonyms = match f.predicate.as_str() {
                    "located_in" => "where location room",
                    "led_by" => "who leads leader",
                    "owner" => "who responsible contact",
                    "quantity" => "how many count stock amount",
                    "role" => "job position",
                    "opens_at" => "when hours time",
                    _ => "",
                };
                let terms: BTreeSet<_> = words(&format!("{} {}", f.predicate, synonyms))
                    .into_iter()
                    .collect();
                let overlap = query_words.intersection(&terms).count() as i32;
                let full_words: BTreeSet<_> = words(&text).into_iter().collect();
                let lexical = query_words.intersection(&full_words).count() as i32;
                let score = if direct {
                    30
                } else if inverse {
                    15
                } else if reached.contains(&f.subject) {
                    5
                } else {
                    0
                } + overlap * 12
                    + lexical;
                ((direct
                    || inverse
                    || (reached.contains(&f.subject) && overlap > 0)
                    || (matched.is_empty() && lexical >= 2 && overlap > 0))
                    && score > 0)
                    .then_some((score, f, text))
            })
            .collect();
        scored.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.id.cmp(&b.1.id)));
        let facts = scored
            .into_iter()
            .take(8)
            .map(|(_, f, text)| Evidence {
                id: f.id.clone(),
                text,
            })
            .collect();
        Ok(Retrieval {
            entity_ids: matched.into_iter().collect(),
            facts,
            ambiguity: vec![],
            notice,
        })
    }
}

#[wasm_bindgen]
pub struct StationGraph {
    graph: Graph,
}
#[wasm_bindgen]
impl StationGraph {
    #[wasm_bindgen(constructor)]
    pub fn new(json: &str) -> Result<StationGraph, JsValue> {
        Graph::parse(json)
            .map(|graph| Self { graph })
            .map_err(|e| JsValue::from_str(&e))
    }
    pub fn summary(&self) -> String {
        serde_json::json!({"name":self.graph.name,"version":self.graph.dataset_version,"entities":self.graph.entities.len(),"facts":self.graph.facts.len()}).to_string()
    }
    pub fn retrieve(
        &self,
        query: &str,
        previous_json: &str,
        event_json: &str,
    ) -> Result<String, JsValue> {
        let prev: Vec<String> =
            serde_json::from_str(previous_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let event: Option<Event> = if event_json.is_empty() {
            None
        } else {
            Some(serde_json::from_str(event_json).map_err(|e| JsValue::from_str(&e.to_string()))?)
        };
        self.graph
            .retrieve(query, &prev, event.as_ref())
            .map(|r| serde_json::to_string(&r).unwrap())
            .map_err(|e| JsValue::from_str(&e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> String {
        include_str!("../../../public/data/station.json").to_owned()
    }
    #[test]
    fn validates_references_and_duplicate_ids() {
        let mut graph: serde_json::Value = serde_json::from_str(&fixture()).unwrap();
        graph["facts"][0]["subject"] = "missing".into();
        assert!(Graph::parse(&graph.to_string())
            .unwrap_err_string()
            .contains("subject"));
        let mut graph: serde_json::Value = serde_json::from_str(&fixture()).unwrap();
        graph["entities"][1]["id"] = graph["entities"][0]["id"].clone();
        assert!(Graph::parse(&graph.to_string()).is_err());
    }
    trait ErrorText {
        fn unwrap_err_string(self) -> String;
    }
    impl ErrorText for Result<Graph, String> {
        fn unwrap_err_string(self) -> String {
            match self {
                Err(e) => e,
                Ok(_) => panic!("expected error"),
            }
        }
    }
    #[test]
    fn retrieves_aliases_followups_and_ambiguity() {
        let graph = Graph::parse(&fixture()).unwrap();
        let result = graph
            .retrieve("Where is the oxygen sensor?", &[], None)
            .unwrap();
        assert!(result.facts[0].text.contains("Room R-01"));
        assert_eq!(result.entity_ids, vec!["device-01"]);
        let follow = graph
            .retrieve("Who is its owner?", &result.entity_ids, None)
            .unwrap();
        assert!(follow.facts[0].text.contains("owner"));
        assert_eq!(
            graph
                .retrieve("Where is Morgan?", &[], None)
                .unwrap()
                .ambiguity
                .len(),
            2
        );
    }
    #[test]
    fn events_are_temporary_and_checked() {
        let graph = Graph::parse(&fixture()).unwrap();
        let before = serde_json::to_string(&graph).unwrap();
        let event: Event = serde_json::from_str(
            r#"{"type":"stock_low","entityId":"supply-01","payload":{"remaining":2}}"#,
        )
        .unwrap();
        assert!(graph
            .retrieve("", &[], Some(&event))
            .unwrap()
            .notice
            .unwrap()
            .contains("Temporary"));
        assert_eq!(before, serde_json::to_string(&graph).unwrap());
        let bad: Event =
            serde_json::from_str(r#"{"type":"delete","entityId":"device-01","payload":{}}"#)
                .unwrap();
        assert!(graph
            .retrieve("", &[], Some(&bad))
            .unwrap()
            .notice
            .unwrap()
            .contains("Unsupported"));
    }
}
