use crate::git;
use serde::Deserialize;
use std::path::Path;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Options {
    pub sign: bool,
}

pub fn commit(path: &Path, message: &str, amend: bool, options: &Options) -> Result<(), String> {
    let mut args = vec!["commit"];
    if amend {
        args.push("--amend");
    }
    if options.sign {
        args.push("--gpg-sign");
    }
    args.extend(["-m", message, "--"]);
    git(path, &args)?;
    Ok(())
}
