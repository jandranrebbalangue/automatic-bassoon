#!/usr/bin/env bash
if [ -z "$1" ]; then
  echo "⚠️   No branch argument passed. Defaulting to 'main'."
  BRANCH="main"
else
  BRANCH="$1"
fi

echo "🚀 Deploying branch: $BRANCH"

git fetch origin

if git show-ref --verify --quiet refs/heads/$BRANCH; then
  git checkout $BRANCH
else
  git checkout -b $BRANCH origin/$BRANCH
fi

git pull origin $BRANCH

docker compose -f docker-compose.yml up -d --build --force-recreate node-app

docker image prune -f

docker builder prune -f