#!/usr/bin/env bash
set -euo pipefail
APP=aish

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
ORANGE='\033[38;2;255;140;0m'
NC='\033[0m' # No Color

requested_version=${VERSION:-}

os=$(uname -s | tr '[:upper:]' '[:lower:]')
if [[ "$os" == "darwin" ]]; then
    os="darwin"
fi
arch=$(uname -m)

if [[ "$arch" == "aarch64" ]]; then
  arch="arm64"
elif [[ "$arch" == "x86_64" ]]; then
  arch="x64"
fi

filename="$APP-$os-$arch.tar.gz"

case "$filename" in
    *"-linux-"*)
        [[ "$arch" == "x64" || "$arch" == "arm64" ]] || exit 1
    ;;
    *"-darwin-"*)
        [[ "$arch" == "x64" || "$arch" == "arm64" ]] || exit 1
    ;;
    *"-windows-"*)
        [[ "$arch" == "x64" ]] || exit 1
    ;;
    *)
        echo "${RED}Unsupported OS/Arch: $os/$arch${NC}"
        exit 1
    ;;
esac

# Use ~/.local/bin following XDG Base Directory specification
# This is the conventional location for user-installed binaries
INSTALL_DIR=$HOME/.local/bin
mkdir -p "$INSTALL_DIR"

if [ -z "$requested_version" ]; then
    url="https://github.com/abhishekbhardwaj/aish-cli/releases/latest/download/$filename"
    specific_version=$(curl -s https://api.github.com/repos/abhishekbhardwaj/aish-cli/releases/latest | awk -F'"' '/"tag_name": "/ {gsub(/^v/, "", $4); print $4}')

    if [[ $? -ne 0 || -z "$specific_version" ]]; then
        echo "${RED}Failed to fetch version information${NC}"
        exit 1
    fi
else
    url="https://github.com/abhishekbhardwaj/aish-cli/releases/download/v${requested_version}/$filename"
    specific_version=$requested_version
fi

print_message() {
    local level=$1
    local message=$2
    local color=""

    case $level in
        info) color="${GREEN}" ;;
        warning) color="${YELLOW}" ;;
        error) color="${RED}" ;;
    esac

    echo -e "${color}${message}${NC}"
}

check_version() {
    if command -v aish >/dev/null 2>&1; then
        aish_path=$(which aish)

        # Check if version is installed
        installed_version=$(aish --version 2>/dev/null || echo "0.0.1")
        installed_version=$(echo $installed_version | awk '{print $1}')

        if [[ "$installed_version" != "$specific_version" ]]; then
            print_message info "Installed version: ${YELLOW}$installed_version."
        else
            print_message info "Version ${YELLOW}$specific_version${GREEN} already installed"
            exit 0
        fi
    fi
}

download_and_install() {
    print_message info "Downloading ${ORANGE}aish ${GREEN}version: ${YELLOW}$specific_version ${GREEN}..."
    mkdir -p aishtmp && cd aishtmp
    curl -# -L -o "$filename" "$url"
    tar -xzf "$filename"
    mv aish-$os-$arch "$INSTALL_DIR/aish"
    chmod +x "$INSTALL_DIR/aish"
    cd .. && rm -rf aishtmp
}

check_version
download_and_install

add_to_path() {
    local config_file=$1
    local command=$2

    if grep -Fxq "$command" "$config_file"; then
        print_message info "Command already exists in $config_file, skipping write."
    elif [[ -w $config_file ]]; then
        echo -e "\n# aish" >> "$config_file"
        echo "$command" >> "$config_file"
        print_message info "Successfully added ${ORANGE}aish ${GREEN}to \$PATH in $config_file"
    else
        print_message warning "Manually add the directory to $config_file (or similar):"
        print_message info "  $command"
    fi
}

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.config}

current_shell=$(basename "$SHELL")
case $current_shell in
    fish)
        config_files="$HOME/.config/fish/config.fish"
    ;;
    zsh)
        config_files="$HOME/.zshrc $HOME/.zshenv $XDG_CONFIG_HOME/zsh/.zshrc $XDG_CONFIG_HOME/zsh/.zshenv"
    ;;
    bash)
        config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile $XDG_CONFIG_HOME/bash/.bashrc $XDG_CONFIG_HOME/bash/.bash_profile"
    ;;
    ash)
        config_files="$HOME/.ashrc $HOME/.profile /etc/profile"
    ;;
    sh)
        config_files="$HOME/.ashrc $HOME/.profile /etc/profile"
    ;;
    *)
        # Default case if none of the above matches
        config_files="$HOME/.bashrc $HOME/.bash_profile $XDG_CONFIG_HOME/bash/.bashrc $XDG_CONFIG_HOME/bash/.bash_profile"
    ;;
esac

config_file=""
for file in $config_files; do
    if [[ -f $file ]]; then
        config_file=$file
        break
    fi
done

if [[ -z $config_file ]]; then
    print_message error "No config file found for $current_shell. Checked files: ${config_files[@]}"
    exit 1
fi

if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    case $current_shell in
        fish)
            add_to_path "$config_file" "fish_add_path $INSTALL_DIR"
        ;;
        zsh)
            add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH"
        ;;
        bash)
            add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH"
        ;;
        ash)
            add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH"
        ;;
        sh)
            add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH"
        ;;
        *)
            export PATH=$INSTALL_DIR:$PATH
            print_message warning "Manually add the directory to $config_file (or similar):"
            print_message info "  export PATH=$INSTALL_DIR:\$PATH"
        ;;
    esac
fi

if [ -n "${GITHUB_ACTIONS-}" ] && [ "${GITHUB_ACTIONS}" == "true" ]; then
    echo "$INSTALL_DIR" >> $GITHUB_PATH
    print_message info "Added $INSTALL_DIR to \$GITHUB_PATH"
fi

echo
print_message info "🎉 ${ORANGE}aish ${GREEN}v${specific_version} installed successfully!"
print_message info "📍 Installed to: ${YELLOW}$INSTALL_DIR/aish"
echo
print_message info "🚀 Get started:"
print_message info "  ${YELLOW}aish configure    ${GREEN}# Configure AI provider first"
echo
print_message info "💡 Then try these commands:"
print_message info "  ${YELLOW}aish c \"show me disk usage\""
print_message info "  ${YELLOW}aish ask \"What's the capital of France?\""
echo
print_message info "📚 To uninstall:"
print_message info "  ${YELLOW}rm -f $INSTALL_DIR/aish"
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    print_message info "  ${YELLOW}# Remove PATH export from your shell config if added"
fi
