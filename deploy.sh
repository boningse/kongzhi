#!/bin/bash

# Exit on error
set -e

echo "====================================="
echo "  Deploying Data Collection System   "
echo "====================================="

# 1. Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
else
    echo "Docker is already installed."
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Installing Docker Compose..."
    if command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y docker-compose-plugin docker-compose
    elif command -v yum &> /dev/null; then
        yum install -y docker-compose-plugin docker-compose
    fi
fi

# 2. Build and run the Docker container
echo "Building and starting the Docker container..."
# 禁用 BuildKit 以解决某些旧环境或内核下的 buildkit 启动失败问题
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0

if docker compose version &> /dev/null; then
    docker compose up -d --build
else
    docker-compose up -d --build
fi

# 3. Install Nginx if not installed
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    if command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y nginx
    elif command -v yum &> /dev/null; then
        # Try to install epel-release, but don't fail if it doesn't exist (like on openEuler)
        yum install -y epel-release || true
        yum install -y nginx
    fi
else
    echo "Nginx is already installed."
fi

# 4. Configure Nginx Reverse Proxy
echo "Configuring Nginx..."
if [ -d /etc/nginx/conf.d ]; then
    # For CentOS/RHEL/Fedora
    cp nginx-caiji.conf /etc/nginx/conf.d/caiji.boningse.com.conf
elif [ -d /etc/nginx/sites-available ]; then
    # For Ubuntu/Debian
    cp nginx-caiji.conf /etc/nginx/sites-available/caiji.boningse.com
    # Enable the site
    if [ ! -L /etc/nginx/sites-enabled/caiji.boningse.com ]; then
        ln -s /etc/nginx/sites-available/caiji.boningse.com /etc/nginx/sites-enabled/
    fi
else
    # Fallback, just copy to nginx config directory
    cp nginx-caiji.conf /etc/nginx/caiji.boningse.com.conf
    echo "Please manually include /etc/nginx/caiji.boningse.com.conf in your nginx.conf"
fi

# Test Nginx configuration and reload
nginx -t
systemctl enable nginx || true
systemctl start nginx || true
systemctl reload nginx || true

echo "====================================="
echo "  Deployment completed successfully! "
echo "  The system is running on http://caiji.boningse.com"
echo "====================================="