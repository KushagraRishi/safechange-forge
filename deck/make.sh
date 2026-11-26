#!/bin/sh
# Builds the deck, adds transitions and fade-ins, renders a PDF and a contact sheet.
set -e
cd "$(dirname "$0")"
export PATH="$HOME/.local/share/fnm/node-versions/v24.22.3/installation/bin:$PATH"
export PPTX_SKILL="${PPTX_SKILL:-$HOME/.claude/plugins/marketplaces/anthropic-agent-skills/skills/pptx}"
OUT=../../presentation/SafeChange_deck_with_notes.pptx
NODE_PATH="$PWD/node_modules" node build.js
python3 add_transitions.py "$OUT"
python3 add_animations.py "$OUT"
