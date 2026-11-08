#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 -m unittest discover -s tests/decision4 -v
python3 -m unittest discover -s core/tests -v
