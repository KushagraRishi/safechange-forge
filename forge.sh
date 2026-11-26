#!/bin/zsh
# Runs the Forge CLI with Node 24 (Forge does not support this Mac's default Node 26.9).
export PATH=/Users/kushagrachaudhary/.local/share/fnm/node-versions/v24.22.3/installation/bin:$PATH
exec forge "$@"
