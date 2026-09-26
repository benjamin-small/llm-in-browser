use station_core::{Event, Graph};
use std::io::{self, BufRead};
fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("usage: station-core graph.json < queries.jsonl");
    let graph = Graph::parse(&std::fs::read_to_string(path).unwrap()).unwrap();
    for line in io::stdin().lock().lines() {
        let result = (|| -> Result<_, String> {
            let v: serde_json::Value = serde_json::from_str(&line.map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            let previous: Vec<String> =
                serde_json::from_value(v.get("previous").cloned().unwrap_or(serde_json::json!([])))
                    .map_err(|e| e.to_string())?;
            let event: Option<Event> =
                serde_json::from_value(v.get("event").cloned().unwrap_or(serde_json::Value::Null))
                    .map_err(|e| e.to_string())?;
            graph.retrieve(v["query"].as_str().unwrap_or(""), &previous, event.as_ref())
        })();
        println!(
            "{}",
            match result {
                Ok(r) => serde_json::to_value(r).unwrap(),
                Err(e) => serde_json::json!({"error":e}),
            }
        );
    }
}
