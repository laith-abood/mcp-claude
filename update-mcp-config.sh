#!/bin/bash

# Script to safely update MCP configuration while preserving custom settings

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration paths
CONFIG_PATH="/Users/laith-dev/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
BACKUP_DIR="/Users/laith-dev/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/backups"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create backup with timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/cline_mcp_settings-$TIMESTAMP.json"

echo -e "${YELLOW}Creating backup of current configuration...${NC}"
cp "$CONFIG_PATH" "$BACKUP_FILE"
echo -e "${GREEN}Backup created at: $BACKUP_FILE${NC}"

# Function to update server paths
update_server_paths() {
    local config_file="$1"
    local mcp_root="/Users/laith-dev/mcp/servers"
    
    # Update project-analyzer path
    jq --arg root "$mcp_root" '.mcpServers.["project-analyzer"].args[0] = $root + "/src/project-analyzer/dist/index.js"' "$config_file" > tmp.$$ && mv tmp.$$ "$config_file"
    
    # Update openai path
    jq --arg root "$mcp_root" '.mcpServers.openai.args[0] = $root + "/src/openai/dist/index.js"' "$config_file" > tmp.$$ && mv tmp.$$ "$config_file"
    
    echo -e "${GREEN}Server paths updated${NC}"
}

# Function to verify configuration
verify_configuration() {
    local config_file="$1"
    
    # Check if file is valid JSON
    if ! jq empty "$config_file" 2>/dev/null; then
        echo -e "${RED}Error: Invalid JSON in configuration file${NC}"
        echo -e "${YELLOW}Restoring from backup...${NC}"
        cp "$BACKUP_FILE" "$config_file"
        exit 1
    fi
    
    # Verify required servers are present
    local required_servers=("memory" "github" "brave-search" "filesystem" "openai" "sequential-thinking" "fetch" "project-analyzer")
    local missing_servers=()
    
    for server in "${required_servers[@]}"; do
        if ! jq -e ".mcpServers.\"$server\"" "$config_file" >/dev/null; then
            missing_servers+=("$server")
        fi
    done
    
    if [ ${#missing_servers[@]} -ne 0 ]; then
        echo -e "${RED}Error: Missing required servers: ${missing_servers[*]}${NC}"
        echo -e "${YELLOW}Restoring from backup...${NC}"
        cp "$BACKUP_FILE" "$config_file"
        exit 1
    fi
    
    echo -e "${GREEN}Configuration verified successfully${NC}"
}

# Main update process
echo -e "${YELLOW}Updating MCP configuration...${NC}"

# Update paths
update_server_paths "$CONFIG_PATH"

# Verify the updated configuration
verify_configuration "$CONFIG_PATH"

echo -e "\n${GREEN}Configuration updated successfully!${NC}"
echo -e "${YELLOW}Backup saved at: $BACKUP_FILE${NC}"
echo -e "${GREEN}You may need to restart VSCode for changes to take effect${NC}"
