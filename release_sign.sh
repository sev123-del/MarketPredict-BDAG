#!/usr/bin/env bash
# Helper to create signed archives for releases (run locally if you want signed artifacts)
set -euo pipefail
TAG=${1:-v0.1}
OUT_PREFIX=MarketPredict-BDAG-${TAG}

git archive --format=tar --prefix=${OUT_PREFIX}/ ${TAG} -o ${OUT_PREFIX}.tar
# create detached ascii-armored signature (requires gpg configured locally)
gpg --armor --detach-sign ${OUT_PREFIX}.tar

echo "Created ${OUT_PREFIX}.tar and ${OUT_PREFIX}.tar.asc - verify locally with gpg --verify"
