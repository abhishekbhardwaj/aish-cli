# AISH Test Cases

## Sudo Command Testing

This document outlines test cases for the sudo password handling feature in AISH.

### Overview

AISH now supports secure password input for sudo commands using the following approach:
- Detects when a command contains `sudo`
- Prompts for password using a masked input field
- Automatically pipes the password to `sudo -S`
- Filters out duplicate password prompts from the output
- Supports multiple languages for sudo prompts

### Test Cases

#### 1. Basic Non-Sudo Command
**Purpose**: Ensure normal commands work without any sudo interference

```bash
./aish c "list files in current directory"
```

**Expected Result**: 
- No password prompt
- Command executes normally
- Output displays immediately

#### 2. Command That Outputs 'Password:' But Isn't Sudo
**Purpose**: Verify that non-sudo commands can output "Password:" without triggering sudo behavior

```bash
./aish c "run the test-password-output.sh script"
```

**Expected Result**:
- No password prompt from AISH
- Script output including "Password:" displays normally
- No password interception occurs

#### 3. Basic Sudo Command
**Purpose**: Test standard sudo command execution

```bash
./aish c "show system uptime with sudo"
```

**Expected Result**:
- AISH prompts: "Enter sudo password: ****"
- No duplicate "Password:" prompt appears
- Command output displays after a newline
- Uptime information shows correctly

#### 4. Sudo Command with Wrong Password
**Purpose**: Test authentication failure handling

```bash
./aish c "list root directory with sudo"
# Enter wrong password intentionally
```

**Expected Result**:
- AISH prompts for password
- After wrong password: "Authentication failed. Incorrect sudo password."
- Shows: "Try again with the correct password."
- Immediately prompts: "Enter sudo password (retry):"
- No y/N confirmation needed between retries
- After 3 failed attempts: "sudo: 3 incorrect password attempts"
- Command aborts (matching sudo's default behavior)

#### 5. Sudo Command with Pipes and Redirects
**Purpose**: Ensure sudo works correctly with shell operators

```bash
./aish c "count files in /root with sudo"
```

**Expected Result**:
- Password prompt appears
- Command executes: `sudo ls /root | wc -l`
- File count displays correctly
- No pipe interference

#### 6. Interactive Commands
**Purpose**: Verify that interactive programs still use TTY mode

```bash
./aish c "open vim editor"
```

**Expected Result**:
- No password prompt (unless command includes sudo)
- Vim opens in interactive mode
- Full TTY control available

#### 7. Command with Timeout
**Purpose**: Test timeout behavior with and without sudo

```bash
# Without sudo
./aish c "sleep for 10 seconds" --timeout 2

# With sudo
./aish c "sleep for 10 seconds with sudo" --timeout 2
```

**Expected Result**:
- Commands timeout after 2 seconds
- Timeout message displays
- For sudo version: password prompt appears first

#### 8. Multi-Language Sudo Prompts
**Purpose**: Verify international sudo prompt support

```bash
# Test with different locale
LANG=fr_FR.UTF-8 ./aish c "show uptime with sudo"
LANG=es_ES.UTF-8 ./aish c "show uptime with sudo"
```

**Expected Result**:
- AISH password prompt appears in English
- Foreign language sudo prompts are filtered
- Command executes correctly regardless of locale

### Edge Cases

#### Sudo in Middle of Pipeline
```bash
./aish c "echo hello | sudo tee /tmp/test.txt"
```

#### Multiple Sudo Commands
```bash
./aish c "sudo ls && sudo whoami"
```

#### Sudo with Flags
```bash
./aish c "run sudo -u otheruser whoami"
```

### Implementation Details

The sudo handling implementation:

1. **Detection**: Uses regex `/\bsudo\b/` to detect sudo commands
2. **Password Prompt**: Uses `@inquirer/prompts` password input with masking
3. **Command Modification**: Replaces `sudo` with `sudo -S` to accept stdin password
4. **Output Filtering**: Removes password prompts in multiple languages:
   - English: "Password:"
   - French: "Mot de passe:"
   - Spanish: "Contraseña:"
   - German: "Passwort:"
   - Japanese: "パスワード:"
   - Chinese: "密码:"
   - Russian: "Пароль:"
5. **Error Handling**: Detects authentication failures and provides clear feedback

### Sudo in Pipes

AISH handles sudo in pipes intelligently using `sudo -v` for authentication:

#### How It Works
1. **Non-piped sudo commands**: Use `sudo -S` with password piped via stdin
2. **Piped sudo commands**: Use `sudo -v` to authenticate first, then run the command with cached credentials

#### Sudo at the Beginning of a Pipe
```bash
./aish c "list root directory with sudo and count files"
# Generates: sudo ls /root | wc -l
```
- AISH password prompt appears
- Password is sent to sudo -S via stdin
- Output is piped to next command
- ✅ Works correctly

#### Sudo in Pipes (Using sudo -v)
```bash
./aish c "echo test and save to protected file with sudo"
# Generates: echo 'test' | sudo tee /tmp/protected.txt
```
- AISH password prompt appears
- Password is used with `sudo -v` to cache credentials
- Original command runs with cached sudo credentials
- ✅ Works correctly

```bash
./aish c "list files and count with sudo"
# Generates: ls -la | sudo wc -l
```
- Same as above - uses sudo -v authentication
- ✅ Works correctly

#### Implementation Details
When AISH detects sudo in a piped command:
1. Prompts for password using inquirer
2. Runs `sudo -S -v` with the password to cache credentials
3. Executes the original command which uses the cached credentials
4. This avoids stdin conflicts between piped data and password input

### Known Limitations

1. Commands that require multiple sudo password entries in sequence may not work correctly
2. Sudo commands that timeout before password entry will fail
3. Custom sudo configurations with non-standard prompts may not be detected
4. When sudo is used in the middle or end of a pipe, interactive mode is required

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