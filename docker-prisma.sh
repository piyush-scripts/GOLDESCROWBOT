#!/bin/sh

# Check if Docker Compose is running
if [ "$(docker-compose ps -q app)" ]; then
  echo "Starting Prisma Studio inside the 'app' container..."
  
  # Exec into the running 'app' container and start Prisma Studio
  docker-compose exec app npx prisma studio
  
  echo "Prisma Studio is now running at http://localhost:5555"
else
  echo "The 'app' service is not running. Please start your containers with 'docker-compose up' first."
fi
