#!/bin/sh
set -eu
./node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
exec node ./apps/api/dist/index.js
