# AISH Comprehensive Test Cases

This document provides an exhaustive list of test cases for AISH (AI Shell Assistant). These tests cover all features, edge cases, and potential regression scenarios.

## Table of Contents
1. [Installation & Setup Tests](#installation--setup-tests)
2. [Configuration Tests](#configuration-tests)
3. [Ask Command Tests](#ask-command-tests)
4. [Command Generation Tests](#command-generation-tests)
5. [Sudo Command Tests](#sudo-command-tests)
6. [Update & Uninstall Tests](#update--uninstall-tests)
7. [Error Handling Tests](#error-handling-tests)
8. [Performance Tests](#performance-tests)
9. [Integration Tests](#integration-tests)

## Installation & Setup Tests

### Initial Setup
```bash
# Test 1: First time setup with no config
rm -rf ~/.config/aish
./aish init
# Expected: Interactive setup wizard

# Test 2: Running commands without configuration
rm -rf ~/.config/aish
./aish ask "what is 2+2"
# Expected: Error message about no AI provider configured

# Test 3: Version check
./aish --version
# Expected: Shows current version

# Test 4: Help command
./aish --help
./aish ask --help
./aish command --help
./aish configure --help
# Expected: Shows appropriate help text
```

## Configuration Tests

### Basic Configuration
```bash
# Test 5: Configure with CLI flags
./aish configure --provider openai --api-key sk-test123 --model gpt-4
# Expected: Success message

# Test 6: Configure with interactive mode
./aish configure
# Expected: Interactive prompts for provider, model, API key

# Test 7: List configurations
./aish configure --list
./aish configuration
# Expected: Shows all configured providers with masked API keys

# Test 8: Configure multiple providers
./aish configure --provider anthropic --api-key sk-ant-test --model claude-3-opus-20240229
./aish configure --provider groq --api-key gsk_test --model llama-3.1-70b-versatile
./aish configure --list
# Expected: Shows all three providers

# Test 9: Set default provider
./aish configure --set-default groq
./aish configuration
# Expected: Shows groq as default with checkmark

# Test 10: Update model for existing provider
./aish configure --update-model openai:gpt-3.5-turbo
./aish configuration
# Expected: OpenAI provider now uses gpt-3.5-turbo

# Test 11: Remove provider
./aish configure --remove groq
./aish configuration
# Expected: Groq provider removed from list

# Test 12: Configure local provider (Ollama)
./aish configure --provider ollama --base-url http://localhost:11434 --model llama2
# Expected: Success, no API key required

# Test 13: Invalid provider
./aish configure --provider invalid-provider --api-key test
# Expected: Error about invalid provider

# Test 14: Missing required fields
./aish configure --provider openai
# Expected: Error about missing API key

# Test 15: Update non-existent provider
./aish configure --update-model nonexistent:model
# Expected: Error about provider not found
```

## Ask Command Tests

### Basic Ask Functionality
```bash
# Test 16: Simple question
./aish ask "what is the capital of France"
# Expected: Streaming response about Paris

# Test 17: Multi-word question
./aish ask what is the meaning of life
# Expected: Philosophical response

# Test 18: Question with special characters
./aish ask "explain 2+2=4"
# Expected: Mathematical explanation

# Test 19: Completion mode (no streaming)
./aish ask "list 3 colors" --completion
# Expected: Complete response without streaming

# Test 20: Provider override
./aish ask "hello" --provider anthropic
# Expected: Uses Anthropic instead of default

# Test 21: Model override
./aish ask "hello" --model gpt-3.5-turbo
# Expected: Uses specified model

# Test 22: Both provider and model override
./aish ask "hello" --provider openai --model gpt-4
# Expected: Uses OpenAI with GPT-4

# Test 23: Invalid provider override
./aish ask "hello" --provider nonexistent
# Expected: Error about provider not found

# Test 24: Very long question
./aish ask "$(printf 'a%.0s' {1..1000})"
# Expected: Handles long input gracefully

# Test 25: Empty question
./aish ask ""
# Expected: Error or handles gracefully

# Test 26: Question with quotes
./aish ask 'what is "hello world"'
# Expected: Handles quotes properly

# Test 27: Interrupt streaming (Ctrl+C)
./aish ask "write a very long story"
# Press Ctrl+C during response
# Expected: Graceful exit with goodbye message
```

## Command Generation Tests

### Basic Command Generation
```bash
# Test 28: Simple command
./aish c "list files"
# Expected: Suggests 'ls' command

# Test 29: Command with alias
./aish command "show current directory"
# Expected: Suggests 'pwd' command

# Test 30: Complex command
./aish c "find all JavaScript files modified in the last week"
# Expected: Suggests find command with appropriate flags

# Test 31: Dangerous command detection
./aish c "delete everything in root directory"
# Expected: [BLOCKED] message, command not executed

# Test 32: Command requiring external packages
./aish c "monitor system resources"
# Expected: May suggest htop/top, indicates if package needed

# Test 33: Interactive command detection
./aish c "edit file with vim"
# Expected: Detects needsInteractiveMode, opens vim properly

# Test 34: Command with pipes
./aish c "count lines in all python files"
# Expected: Suggests something like: find . -name "*.py" | xargs wc -l

# Test 35: Command with redirects
./aish c "save process list to file"
# Expected: Suggests: ps aux > processes.txt

# Test 36: Verbose mode
./aish c "compress files" --verbose
# Expected: Shows explanation and detailed context

# Test 37: TTY force mode
./aish c "run python" --tty
# Expected: Forces interactive mode

# Test 38: Timeout option
./aish c "sleep for 10 seconds" --timeout 2
# Expected: Command times out after 2 seconds

# Test 39: Provider override for command
./aish c "list files" --provider anthropic
# Expected: Uses specified provider

# Test 40: Model override for command
./aish c "list files" --model gpt-3.5-turbo
# Expected: Uses specified model
```

### Command Modification Flow
```bash
# Test 41: Reject command
./aish c "remove file"
# Type 'n' at prompt
# Expected: Command aborted

# Test 42: Modify command
./aish c "list files"
# Type 'show hidden files too' at prompt
# Expected: Refines to 'ls -la' or similar

# Test 43: Approve with 'yes'
./aish c "show date"
# Type 'yes' at prompt
# Expected: Executes date command

# Test 44: Empty response (default reject)
./aish c "list files"
# Press Enter at prompt
# Expected: Command rejected

# Test 45: Single character that's not y/n
./aish c "list files"
# Type 'x' at prompt
# Expected: Command rejected
```

### Command Failure Handling
```bash
# Test 46: Command not found
./aish c "run nonexistentcommand"
# Approve execution
# Expected: Failure analysis, suggests alternative

# Test 47: Permission denied (non-sudo)
./aish c "write to /etc/hosts without sudo"
# Expected: Suggests sudo version

# Test 48: File not found
./aish c "read nonexistent.txt"
# Expected: Suggests creating file or checking path

# Test 49: Invalid flag
./aish c "list with invalid flag"
# If generates 'ls --invalid'
# Expected: Suggests working alternative

# Test 50: Command fails, no alternative
./aish c "do something impossible"
# Expected: Explanation, allows modification

# Test 51: Multiple failure attempts
./aish c "complex failing command"
# Keep modifying until it works
# Expected: Maintains conversation context
```

### Conversation Context
```bash
# Test 52: Multi-turn conversation
./aish c "create a test file"
# Approve: touch test.txt
./aish c "now add some content to it"
# Expected: Suggests echo "content" > test.txt or similar

# Test 53: Reference previous command
./aish c "find python files"
# Reject and modify: "only in src directory"
# Expected: Refines based on context

# Test 54: Long conversation history
# Run multiple related commands
# Expected: Maintains context throughout
```

## Sudo Command Testing

### Basic Sudo Tests
```bash
# Test 55: Simple sudo command
./aish c "check system uptime with sudo"
# Expected: Prompts for password, executes 'sudo uptime'

# Test 56: Sudo with wrong password (3 attempts)
./aish c "list root directory with sudo"
# Enter wrong password 3 times
# Expected: 
# - 1st attempt: "Enter sudo password:"
# - 2nd attempt: "Enter sudo password (retry):"
# - 3rd attempt: "Enter sudo password (retry):"
# - After 3rd: "sudo: 3 incorrect password attempts"

# Test 57: Sudo retry with correct password
./aish c "show root files with sudo"
# Enter wrong password once, then correct
# Expected: Succeeds on second attempt

# Test 58: Command with 'sudo' in name but not sudo
./aish c "find files with sudo in the name"
# Expected: Generates 'find . -name "*sudo*"', no password prompt

# Test 59: Sudo at start of pipe
./aish c "list root directory with sudo and count files"
# Expected: 'sudo ls /root | wc -l', password prompt works

# Test 60: Sudo in middle of pipe
./aish c "echo hello and save to protected file with sudo"
# Expected: 'echo hello | sudo tee /tmp/protected.txt'
# Uses sudo -v for authentication

# Test 61: Sudo at end of pipe
./aish c "list files and count with sudo"
# Expected: 'ls -la | sudo wc -l'
# Uses sudo -v for authentication

# Test 62: Multiple sudo in command
./aish c "list root and show user with sudo"
# Expected: 'sudo ls /root && sudo whoami'
# Single password prompt for both

# Test 63: Sudo with flags
./aish c "run command as another user with sudo"
# Expected: 'sudo -u username command'
# Password prompt still works

# Test 64: Sudo with timeout
./aish c "sleep for 10 seconds with sudo" --timeout 2
# Expected: Password prompt, then timeout after 2 seconds

# Test 65: Sudo in interactive mode
./aish c "edit protected file with sudo" --tty
# Expected: Uses terminal for password entry

# Test 66: Interrupt during sudo password
./aish c "list root with sudo"
# Press Ctrl+C during password prompt
# Expected: Graceful exit

# Test 67: Sudo with very long command
./aish c "run a very long command with sudo that has many arguments"
# Expected: Handles long commands properly

# Test 68: Sudo password with special characters
./aish c "list root with sudo"
# Enter password with special chars: !@#$%^&*()
# Expected: Handles special characters properly

# Test 69: Multi-language sudo prompts
LANG=fr_FR.UTF-8 ./aish c "list root with sudo"
LANG=es_ES.UTF-8 ./aish c "list root with sudo"
LANG=de_DE.UTF-8 ./aish c "list root with sudo"
# Expected: Filters password prompts in any language

# Test 70: Sudo with input redirection
./aish c "copy file to protected location with sudo"
# Expected: Handles 'sudo cp file /protected/location'

# Test 71: Complex pipe with sudo
./aish c "show processes, filter, save with sudo, and count"
# Expected: 'ps aux | grep node | sudo tee /tmp/proc.txt | wc -l'

# Test 72: Sudo command fails for non-password reason
./aish c "sudo nonexistentcommand"
# Enter correct password
# Expected: Command fails, suggests alternative

# Test 73: Password prompt filtering
echo '#!/bin/bash
echo "Password: not a real prompt"
echo "This should display"' > test-pwd.sh
chmod +x test-pwd.sh
./aish c "run test-pwd.sh"
# Expected: Shows output, no password prompt triggered
rm test-pwd.sh
```

## Update & Uninstall Tests

### Update Command
```bash
# Test 74: Check for updates without installing
./aish update --check
# Expected: Shows if update is available

# Test 75: Update to latest version
./aish update
# Expected: Downloads and installs latest version

# Test 76: Update when already on latest
./aish update
# Expected: Message about already being on latest version

# Test 77: Update with network error
# Disconnect network
./aish update
# Expected: Error message about network failure

# Test 78: Update with insufficient permissions
chmod 444 $(which aish)
./aish update
# Expected: Permission error
chmod 755 $(which aish)
```

### Uninstall Command
```bash
# Test 79: Uninstall with confirmation
./aish uninstall
# Type 'y' to confirm
# Expected: Removes binary and config

# Test 80: Uninstall with force flag
./aish uninstall --force
# Expected: No confirmation, immediate uninstall

# Test 81: Uninstall config only
./aish uninstall --config-only
# Expected: Removes ~/.config/aish but keeps binary

# Test 82: Cancel uninstall
./aish uninstall
# Type 'n' to cancel
# Expected: Uninstall cancelled
```

## Error Handling Tests

### Network Errors
```bash
# Test 83: API request with no network
# Disconnect network
./aish ask "hello"
# Expected: Network error message

# Test 84: API request with invalid API key
./aish configure --provider openai --api-key invalid-key --model gpt-4
./aish ask "hello"
# Expected: Authentication error

# Test 85: API request timeout
# Use a very slow network
./aish ask "write a very long story"
# Expected: Handles timeout gracefully

# Test 86: Rate limit error
# Make many rapid requests
for i in {1..50}; do ./aish ask "hi" & done
# Expected: Rate limit error handling
```

### File System Errors
```bash
# Test 87: Config directory not writable
chmod 000 ~/.config/aish
./aish configure --provider openai --api-key test --model gpt-4
# Expected: Permission error
chmod 755 ~/.config/aish

# Test 88: Config file corrupted
echo "invalid json {" > ~/.config/aish/config.json
./aish configuration
# Expected: Error about invalid config, suggestion to reconfigure

# Test 89: Binary not executable
chmod 000 ./aish
./aish ask "hello"
# Expected: Permission denied
chmod 755 ./aish
```

### Input Validation
```bash
# Test 90: Invalid timeout value
./aish c "list files" --timeout abc
./aish c "list files" --timeout -5
# Expected: Error about invalid timeout

# Test 91: Unknown options
./aish ask "hello" --unknown-flag
./aish c "list" --invalid-option
# Expected: Handles unknown options gracefully

# Test 92: Missing required arguments
./aish ask
./aish c
# Expected: Error about missing arguments

# Test 93: Invalid provider in config
echo '{"providers":[{"provider":"invalid","apiKey":"test"}]}' > ~/.config/aish/config.json
./aish ask "hello"
# Expected: Error about invalid provider
```

## Performance Tests

### Large Input/Output
```bash
# Test 94: Very long command query
./aish c "$(printf 'find files with extension %.0s' {1..100})"
# Expected: Handles long input

# Test 95: Command with large output
./aish c "show all system processes with details"
# Approve: ps aux
# Expected: Handles large output without issues

# Test 96: Streaming large AI response
./aish ask "write a 1000 word essay about technology"
# Expected: Streams smoothly without memory issues

# Test 97: Many rapid commands
for i in {1..10}; do
  ./aish c "echo test $i" <<< "y"
done
# Expected: All commands execute properly
```

### Resource Usage
```bash
# Test 98: Memory usage during long session
# Run many commands in sequence
# Monitor memory usage
# Expected: No memory leaks

# Test 99: CPU usage during streaming
./aish ask "count from 1 to 1000"
# Monitor CPU usage
# Expected: Reasonable CPU usage

# Test 100: Concurrent command execution
./aish c "sleep 5" &
./aish c "echo hello" &
# Expected: Both commands work properly
```

## Integration Tests

### Shell Integration
```bash
# Test 101: Pipe AISH output
./aish ask "list 3 colors" --completion | grep -c "blue"
# Expected: Grep works on output

# Test 102: Redirect AISH output
./aish ask "say hello" --completion > output.txt
cat output.txt
# Expected: Output saved to file
rm output.txt

# Test 103: AISH in shell script
echo '#!/bin/bash
./aish ask "what is 2+2" --completion
' > test.sh
chmod +x test.sh
./test.sh
# Expected: Works in script
rm test.sh

# Test 104: Background execution
./aish ask "count to 5" &
# Expected: Runs in background

# Test 105: Command substitution
echo "The answer is: $(./aish ask 'what is 2+2' --completion)"
# Expected: Command substitution works
```

### Environment Variables
```bash
# Test 106: PATH with spaces
PATH="/path with spaces:$PATH" ./aish c "list files"
# Expected: Handles spaces in PATH

# Test 107: Special characters in env
SPECIAL_VAR="!@#$%^&*()" ./aish c "echo \$SPECIAL_VAR"
# Expected: Handles special characters

# Test 108: Unicode in environment
UNICODE_VAR="🚀 Hello 世界" ./aish c "echo \$UNICODE_VAR"
# Expected: Handles unicode properly

# Test 109: Very long PATH
LONG_PATH="$(printf '/path%.0s' {1..1000}):$PATH" ./aish c "which ls"
# Expected: Handles long PATH
```

### Cross-Platform Tests
```bash
# Test 110: Line endings (if on Windows)
./aish c "create file with CRLF"
# Expected: Handles line endings properly

# Test 111: Path separators
./aish c "navigate to home directory"
# Expected: Uses correct path separator for OS

# Test 112: Case sensitivity
./aish c "find FILE.txt and file.txt"
# Expected: Respects OS case sensitivity
```

## Stress Tests

### Rapid Fire Commands
```bash
# Test 113: Many commands in quick succession
for i in {1..20}; do
  ./aish c "echo $i" <<< "y" &
done
wait
# Expected: All complete successfully

# Test 114: Interrupt during rapid commands
for i in {1..100}; do
  ./aish c "echo $i" <<< "y"
done
# Press Ctrl+C after a few
# Expected: Graceful interruption
```

### Edge Case Inputs
```bash
# Test 115: Binary data in command
./aish c "echo $(cat /dev/urandom | head -c 100 | base64)"
# Expected: Handles binary data

# Test 116: Null bytes
./aish c "find files with null bytes"
# Expected: Handles null bytes properly

# Test 117: Maximum command length
LONG_CMD=$(printf 'a%.0s' {1..10000})
./aish c "echo $LONG_CMD"
# Expected: Handles or errors gracefully

# Test 118: Recursive command generation
./aish c "run aish to list files"
# Expected: Doesn't create infinite loop

# Test 119: Command with all special characters
./aish c 'echo "!@#$%^&*()_+-=[]{}|;:,.<>?"'
# Expected: Handles all special characters

# Test 120: Empty environment
env -i ./aish ask "hello"
# Expected: Works with minimal environment
```

## Regression Tests

### Previous Bug Scenarios
```bash
# Test 121: Sudo without TTY (original issue)
./aish c "list root directory with sudo"
# Expected: Password prompt works

# Test 122: Commands with backticks
./aish c "show current date with backticks"
# If generates: echo `date`
# Expected: Executes properly

# Test 123: Heredoc in commands
./aish c "create multiline file"
# If generates heredoc
# Expected: Handles heredoc syntax

# Test 124: Command with &&, ||, ;
./aish c "run multiple commands"
# Expected: Handles command separators

# Test 125: Glob patterns
./aish c "remove all .tmp files"
# Expected: Handles glob expansion
```

## Cleanup

```bash
# Clean up test artifacts
rm -f output.txt test.sh test-pwd.sh
rm -f /tmp/test.txt /tmp/protected.txt /tmp/proc.txt
# Reset configuration if needed
# ./aish configure
```

## Test Execution Guidelines

1. **Run tests in order** - Some tests depend on previous setup
2. **Reset between sections** - Clear config when testing different features
3. **Monitor resources** - Watch for memory leaks during long tests
4. **Test on different systems** - macOS, Linux, WSL if possible
5. **Test with different shells** - bash, zsh, fish
6. **Test with different terminals** - Terminal.app, iTerm2, VS Code terminal
7. **Document failures** - Note which test failed and exact error message
8. **Test both installed and development versions** - `./aish` vs `/usr/local/bin/aish`

## Success Criteria

- All tests pass without errors
- No memory leaks during extended use
- Graceful handling of all error conditions
- Consistent behavior across platforms
- No regression from previous versions
- Performance remains acceptable under load

### Manual Testing Commands

Here are all the test commands you should run to verify sudo functionality:

#### Basic Tests
```bash
# Test 1: Basic non-sudo command
./aish c "list files in current directory"

# Test 2: Command that outputs 'Password:' but isn't sudo
echo '#!/bin/bash
echo "This script outputs Password: but is not a sudo command"
echo "Password: fake_password_prompt"
echo "This should be displayed normally"' > test-password.sh
chmod +x test-password.sh
./aish c "run test-password.sh"
rm test-password.sh

# Test 3: Basic sudo command
./aish c "show system uptime with sudo"

# Test 4: Sudo command with wrong password (test 3 attempts)
./aish c "list root directory with sudo"
# Enter wrong password 3 times to test retry limit

# Test 5: Sudo with pipes
./aish c "count files in root directory with sudo"
# Should generate: sudo ls /root | wc -l

# Test 6: Sudo in middle of pipe
./aish c "echo hello and save to protected file with sudo"
# Should generate: echo 'hello' | sudo tee /tmp/test.txt

# Test 7: Multiple sudo commands
./aish c "list root and show current user with sudo"
# Should generate: sudo ls /root && sudo whoami

# Test 8: Sudo with flags
./aish c "run whoami as another user with sudo"
# Should generate: sudo -u otheruser whoami

# Test 9: Command with timeout
./aish c "sleep for 10 seconds" --timeout 2
./aish c "sleep for 10 seconds with sudo" --timeout 2

# Test 10: Interactive command
./aish c "open vim editor"

# Test 11: Multi-language sudo (if available)
LANG=fr_FR.UTF-8 ./aish c "show uptime with sudo"
LANG=es_ES.UTF-8 ./aish c "show uptime with sudo"
```

#### Edge Case Tests
```bash
# Sudo at end of pipe
./aish c "list files and count with sudo"
# Should generate: ls -la | sudo wc -l

# Complex pipe with sudo
./aish c "show processes, filter node, save to file with sudo, and count"
# Should generate: ps aux | grep node | sudo tee /tmp/processes.txt | wc -l

# Sudo with input redirection
./aish c "copy README to temp with sudo"
# Should generate: sudo cp README.md /tmp/

# Command with 'sudo' in the name but not actual sudo
./aish c "search for files with sudo in the name"
# Should generate: find . -name "*sudo*"
```

### Cleanup Commands
```bash
# Remove any test files created
rm -f /tmp/test.txt /tmp/processes.txt
```