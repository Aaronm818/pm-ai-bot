# Makefile for Azure Container Registry deployment
# Usage: make build-and-push

# Load environment variables from deployment config
include deployment.env

# Default values (can be overridden in deployment.env)
IMAGE_NAME ?= acs-teams-recording
VERSION ?= latest
PLATFORMS ?= linux/amd64,linux/arm64

# Colors for output
RED = \033[0;31m
GREEN = \033[0;32m
YELLOW = \033[1;33m
NC = \033[0m # No Color

.PHONY: help login build build-multi push build-and-push clean setup-buildx

# Default target
help:
	@echo "$(GREEN)Azure Container Registry Deployment Makefile$(NC)"
	@echo "$(YELLOW)Available targets:$(NC)"
	@echo "  help           - Show this help message"
	@echo "  setup          - Setup Docker buildx for multi-platform builds"
	@echo "  login          - Login to Azure Container Registry"
	@echo "  build          - Build Docker image for current platform"
	@echo "  build-multi    - Build multi-platform Docker image"
	@echo "  push           - Push image to ACR"
	@echo "  build-and-push - Build and push multi-platform image (recommended)"
	@echo "  clean          - Clean up Docker buildx builder"
	@echo "  validate       - Validate deployment.env configuration"
	@echo ""
	@echo "$(YELLOW)Required environment variables (set in deployment.env):$(NC)"
	@echo "  ACR_NAME       - Your Azure Container Registry name"
	@echo "  ACR_LOGIN_SERVER - Your ACR login server (e.g., myregistry.azurecr.io)"
	@echo ""
	@echo "$(YELLOW)Optional environment variables:$(NC)"
	@echo "  IMAGE_NAME     - Docker image name (default: acs-teams-recording)"
	@echo "  VERSION        - Image version tag (default: latest)"
	@echo "  PLATFORMS      - Target platforms (default: linux/amd64,linux/arm64)"

# Validate required environment variables
validate:
	@echo "$(YELLOW)Validating configuration...$(NC)"
	@if [ -z "$(ACR_NAME)" ]; then \
		echo "$(RED)Error: ACR_NAME is not set in deployment.env$(NC)"; \
		exit 1; \
	fi
	@if [ -z "$(ACR_LOGIN_SERVER)" ]; then \
		echo "$(RED)Error: ACR_LOGIN_SERVER is not set in deployment.env$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)Configuration is valid$(NC)"
	@echo "  ACR Name: $(ACR_NAME)"
	@echo "  ACR Login Server: $(ACR_LOGIN_SERVER)"
	@echo "  Image: $(ACR_LOGIN_SERVER)/$(IMAGE_NAME):$(VERSION)"
	@echo "  Platforms: $(PLATFORMS)"

# Setup Docker buildx for multi-platform builds
setup-buildx:
	@echo "$(YELLOW)Setting up Docker buildx for multi-platform builds...$(NC)"
	@docker buildx create --name acr-builder --use --bootstrap || true
	@docker buildx inspect --bootstrap
	@echo "$(GREEN)Docker buildx setup complete$(NC)"

# Login to Azure Container Registry
login: validate
	@echo "$(YELLOW)Logging into Azure Container Registry...$(NC)"
	@az acr login --name $(ACR_NAME)
	@echo "$(GREEN)Successfully logged into $(ACR_NAME)$(NC)"

# Build Docker image for current platform only
build: validate
	@echo "$(YELLOW)Building Docker image for current platform...$(NC)"
	@docker build -t $(ACR_LOGIN_SERVER)/$(IMAGE_NAME):$(VERSION) .
	@echo "$(GREEN)Build complete: $(ACR_LOGIN_SERVER)/$(IMAGE_NAME):$(VERSION)$(NC)"

# Build multi-platform Docker image
build-multi: validate setup-buildx
	@echo "$(YELLOW)Building multi-platform Docker image...$(NC)"
	@echo "Platforms: $(PLATFORMS)"
	@docker buildx build \
		--platform $(PLATFORMS) \
		--tag $(ACR_LOGIN_SERVER)/$(IMAGE_NAME):$(VERSION) \
		--tag $(ACR_LOGIN_SERVER)/$(IMAGE_NAME):latest \
		--push \
		.
	@echo "$(GREEN)Multi-platform build and push complete$(NC)"

# Push image to ACR (for single platform builds)
push: validate
	@echo "$(YELLOW)Pushing image to Azure Container Registry...$(NC)"
	@docker push $(ACR_LOGIN_SERVER)/$(IMAGE_NAME):$(VERSION)
	@if [ "$(VERSION)" != "latest" ]; then \
		docker tag $(ACR_LOGIN_SERVER)/$(IMAGE_NAME):$(VERSION) $(ACR_LOGIN_SERVER)/$(IMAGE_NAME):latest; \
		docker push $(ACR_LOGIN_SERVER)/$(IMAGE_NAME):latest; \
	fi
	@echo "$(GREEN)Push complete$(NC)"

# Build and push multi-platform image (recommended)
build-and-push: validate login build-multi
	@echo "$(GREEN)Build and push process completed successfully!$(NC)"
	@echo "$(YELLOW)Your image is now available at:$(NC)"
	@echo "  $(ACR_LOGIN_SERVER)/$(IMAGE_NAME):$(VERSION)"
	@echo "  $(ACR_LOGIN_SERVER)/$(IMAGE_NAME):latest"

# Clean up Docker buildx builder
clean:
	@echo "$(YELLOW)Cleaning up Docker buildx builder...$(NC)"
	@docker buildx rm acr-builder || true
	@echo "$(GREEN)Cleanup complete$(NC)"

# Quick development build (current platform only)
dev-build:
	@echo "$(YELLOW)Building development image...$(NC)"
	@docker build -t $(IMAGE_NAME):dev .
	@echo "$(GREEN)Development build complete: $(IMAGE_NAME):dev$(NC)"

# Run locally for testing
run-local: dev-build
	@echo "$(YELLOW)Running container locally...$(NC)"
	@docker run -p 3000:3000 --env-file .env $(IMAGE_NAME):dev
