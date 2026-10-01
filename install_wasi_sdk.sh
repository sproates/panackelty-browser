#!/bin/sh
# Optional browser build toolchain; never part of native make targets.
set -eu
destination=$1
mkdir -p "$destination"
if ! echo "b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4  $destination/wasi.tar.gz" | sha256sum --check --status 2>/dev/null; then
  rm -f "$destination/wasi.tar.gz"
  curl --fail --location --retry 3 https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-34/wasi-sdk-34.0-x86_64-linux.tar.gz -o "$destination/wasi.tar.gz"
fi
echo "b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4  $destination/wasi.tar.gz" | sha256sum --check
tar --no-same-owner -xzf "$destination/wasi.tar.gz" -C "$destination"
