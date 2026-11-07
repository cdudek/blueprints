#!/usr/bin/env bash
# Test probe: reads the value on stdin and accepts it unless it is the word "rejected".
# A real probe calls the vendor with the value on stdin, never in argv or a here-string (bash 3.2 writes
# those to a temp file), for example:
#   printf 'header = "Authorization: Bearer %s"\n' "$value" | curl --fail -sS -o /dev/null --config - https://api.example.com/v1/account
value=$(cat)
[ "$value" != rejected ]
