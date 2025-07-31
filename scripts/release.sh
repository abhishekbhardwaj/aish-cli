#!/bin/bash
set -e

# AISH Release Script
# Automates the release process including version bumping, building, and publishing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&2; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# Check if we're in a git repository
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Not in a git repository"
        exit 1
    fi
}

# Check if working directory is clean
check_clean_working_dir() {
    if [ -n "$(git status --porcelain)" ]; then
        log_error "Working directory is not clean. Please commit or stash changes."
        git status --short
        exit 1
    fi
}

# Get current version from package.json
get_current_version() {
    if command -v jq >/dev/null 2>&1; then
        jq -r '.version' "$PROJECT_DIR/package.json"
    else
        grep '"version"' "$PROJECT_DIR/package.json" | sed 's/.*"version": *"\([^"]*\)".*/\1/'
    fi
}

# Bump version
bump_version() {
    local bump_type=$1
    local current_version=$(get_current_version)

    # Parse version components
    local major minor patch
    IFS='.' read -r major minor patch <<< "$current_version"

    case "$bump_type" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            log_error "Invalid bump type: $bump_type. Use major, minor, or patch."
            exit 1
            ;;
    esac

    local new_version="$major.$minor.$patch"

    # Update package.json
    if command -v jq >/dev/null 2>&1; then
        jq ".version = \"$new_version\"" "$PROJECT_DIR/package.json" > "$PROJECT_DIR/package.json.tmp"
        mv "$PROJECT_DIR/package.json.tmp" "$PROJECT_DIR/package.json"
    else
        sed -i.bak "s/\"version\": *\"[^\"]*\"/\"version\": \"$new_version\"/" "$PROJECT_DIR/package.json"
        rm "$PROJECT_DIR/package.json.bak"
    fi

    # Return ONLY the version string, no logging
    echo "$new_version"
}



# Create git tag and commit
create_git_tag() {
    local version=$1
    local tag="v$version"

    cd "$PROJECT_DIR"

    log_info "Creating git commit and tag..."

    # Add changes and suppress all output
    git add package.json >/dev/null 2>&1
    git commit -m "chore: bump version to $version" >/dev/null 2>&1

    # Create tag and suppress all output
    git tag -a "$tag" -m "Release $tag" >/dev/null 2>&1

    log_success "Created tag $tag"

    # Return ONLY the tag, no logging
    echo "$tag"
}

# Push to remote
push_to_remote() {
    local tag=$1

    log_info "Pushing to remote..."

    # Push commits and tags
    git push origin main
    git push origin "$tag"

    log_success "Pushed to remote"
}

# Show usage
show_usage() {
    echo "AISH Release Script"
    echo
    echo "Usage: $0 [OPTIONS] <bump_type>"
    echo
    echo "Bump types:"
    echo "  major    Increment major version (1.0.0 -> 2.0.0)"
    echo "  minor    Increment minor version (1.0.0 -> 1.1.0)"
    echo "  patch    Increment patch version (1.0.0 -> 1.0.1)"
    echo
    echo "Options:"
    echo "  --dry-run    Show what would be done without making changes"
    echo "  --no-push    Don't push to remote repository"
    echo "  --help, -h   Show this help message"
    echo
    echo "Examples:"
    echo "  $0 patch                    # Release a patch version"
    echo "  $0 minor --dry-run          # Preview a minor version release"
    echo "  $0 major --no-push          # Release major version locally only"
}

# Main release process
main() {
    local bump_type=""
    local dry_run=false
    local no_push=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                dry_run=true
                shift
                ;;
            --no-push)
                no_push=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            major|minor|patch)
                bump_type=$1
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    if [ -z "$bump_type" ]; then
        log_error "Bump type is required"
        show_usage
        exit 1
    fi

    echo "🚀 AISH Release Process"
    echo "======================="

    if [ "$dry_run" = true ]; then
        log_warning "DRY RUN MODE - No changes will be made"
    fi

    # Pre-flight checks
    check_git_repo
    check_clean_working_dir

    # Show current status
    local current_version=$(get_current_version)
    log_info "Current version: $current_version"
    log_info "Bump type: $bump_type"

    if [ "$dry_run" = true ]; then
        log_info "Would bump version to next $bump_type version"
        log_info "Would create git tag and push to remote"
        log_info "GitHub Actions would then build and release binaries"
        exit 0
    fi

    # Confirm release
    echo
    read -p "Continue with release? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Release cancelled"
        exit 0
    fi

    # Execute release steps
    log_info "Bumping version..."
    local new_version=$(bump_version "$bump_type")
    log_info "New version: $new_version"

    local tag=$(create_git_tag "$new_version")

    if [ "$no_push" = false ]; then
        push_to_remote "$tag"
        log_info "GitHub Actions will automatically create the release"
    else
        log_warning "Skipped pushing to remote (--no-push)"
        log_info "To complete the release, run: git push origin main && git push origin $tag"
    fi

    echo
    log_success "🎉 Release $tag completed!"
    echo
    echo "Next steps:"
    echo "  1. Monitor GitHub Actions at: https://github.com/abhishekbhardwaj/aish-cli/actions"
    echo "  2. Release will be created automatically when builds complete"
    echo "  3. Binaries will be available at: https://github.com/abhishekbhardwaj/aish-cli/releases"
}

# Check dependencies
check_dependencies() {
    local missing_deps=()

    if ! command -v bun >/dev/null 2>&1; then
        missing_deps+=("bun")
    fi

    if ! command -v git >/dev/null 2>&1; then
        missing_deps+=("git")
    fi

    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        exit 1
    fi
}

# Run main function
check_dependencies
main "$@"
