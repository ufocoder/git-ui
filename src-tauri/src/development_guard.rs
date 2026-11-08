use std::path::Path;

pub(crate) fn is_running_source(path: &Path) -> bool {
    #[cfg(debug_assertions)]
    {
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).parent();
        if let (Some(source), Ok(repository)) = (source, path.canonicalize()) {
            return source.canonicalize().ok().as_ref() == Some(&repository);
        }
    }
    #[cfg(not(debug_assertions))]
    let _ = path;
    false
}

pub(crate) fn ensure_safe(path: &Path) -> Result<(), String> {
    if is_running_source(path) {
        return Err(crate::locale::text("dev.source-checkout").into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_guards_the_running_source_checkout_in_debug_builds() {
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        assert_eq!(is_running_source(source), cfg!(debug_assertions));
        assert_eq!(
            is_running_source(&source.join("src/..")),
            cfg!(debug_assertions)
        );
        assert!(!is_running_source(Path::new(env!("CARGO_MANIFEST_DIR"))));
        let other = crate::tests::TempRepo::new();
        assert!(!is_running_source(&other.0));
    }
}
