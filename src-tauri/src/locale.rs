use std::sync::OnceLock;

fn messages() -> &'static serde_json::Value {
    static MESSAGES: OnceLock<serde_json::Value> = OnceLock::new();
    MESSAGES.get_or_init(|| {
        serde_json::from_str(include_str!("../../locales/ru.json"))
            .expect("invalid locale dictionary")
    })
}

pub fn text(key: &str) -> &'static str {
    messages()[key].as_str().expect("unknown translation key")
}

pub fn format(key: &str, parameters: &[(&str, String)]) -> String {
    let template = text(key);
    let mut result = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        result.push_str(&rest[..start]);
        let Some(end) = rest[start..].find('}') else {
            rest = &rest[start..];
            break;
        };
        let name = &rest[start + 1..start + end];
        if let Some((_, value)) = parameters.iter().find(|(key, _)| *key == name) {
            result.push_str(value);
        } else {
            result.push_str(&rest[start..=start + end]);
        }
        rest = &rest[start + end + 1..];
    }
    result.push_str(rest);
    result
}
