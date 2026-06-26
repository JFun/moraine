#!/usr/bin/env bash
# Publish the web game to GitHub Pages as the instant-play surface.
#
# GitHub Pages serves main/docs, so the playable build lives at docs/play/ and is
# reachable at https://jfun.github.io/moraine/play/ — which is exactly where the
# daily share card's DAILY_URL (web/js/game.js) points. A shared link
# (…/play/?d=<day>&ref=<id>) opens that daily instantly in the browser, no install.
#
# docs/play/ is a generated MIRROR of web/ (don't hand-edit it). Run this after any
# web/ change that should reach the hosted surface, then commit docs/play/ + push
# (Pages redeploys from main/docs within ~1 min).
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p docs/play
rsync -a --delete --exclude='.DS_Store' web/ docs/play/
echo "published web/ -> docs/play/ ($(find docs/play -type f | wc -l | tr -d ' ') files)"
