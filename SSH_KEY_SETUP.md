# SSH Key Authentication Setup Guide

## 🔐 Stop Password Prompts - Set Up SSH Keys

Your SSH key has been generated and is ready to install on the server.

### **Method 1: Automated Script (Recommended)**
Run the PowerShell script when you have a stable connection:
```powershell
.\setup-ssh-keys.ps1
```

### **Method 2: Manual Setup**

#### **Step 1: Your Public Key**
Copy this entire line (it's one long line):
```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDABNvgowdtSKJQeY5nRP+Y+/GXTR/AqEWbrPeRrKnLvBbhW6c3LHvcyjJ9e+5c1GpJbBU1rtH2VHDZUcOQ62yBun8PkHT0/VbGn9waqEb7BdJypG+LP5rC6KLUEOrLFxqj9gXJMDeGNRAMmaaXil9FSilkJzWI+MiOOC5NPIKO7At8x2hkcX3/+2IhfYckwroYsfCJE3r/UiJHm6Pf1vBrefLqrupdNI6Nqdo9CzIZrry8ZKTiINcyKy7+IKCEm9K0Cv40CQdZucHbc0/6X3yhd3PikRoJ3SbnIzYTtfWNTpNFsLldjsJbT47IJmPGWnyVZ03OruomLQ4EBbOX9MiGBpVr18wrgNUJcCjoayFQPCHXw/tlpWVM+/YniccbfH3808Fz0eFoKNQs4wUq0Ye+gNXAmWQfdt7ML4c6CZWD/1i8+EaTdAmTBLhxNbbA+ceBGT8bWVfQ5WaX78DaHw1IQiM42YlM2AK7chTBhXvMyY0zZJ5F4RlLB4ICvCFTShUNb8XptNWkYM0/JRCTzWmHWxWb1fgi2QkzecDn0f7RjsVx8+5IhvTKhRjo5DAQ7+H7S7etLs1AbcX/JPQ2VUgTSuBlW3Sh7mpysdJ1IJtOALt6qdEsmJWbJLfsxOQeOisuU/BO3dQKTUfpqC0DvbNCa7+iBIJ+2oKk/sLZMh2GEw== NorthpassPP-deployment
```

#### **Step 2: Connect to Server and Install Key**
```bash
# Connect to your server
ssh -p 22 NTXPTRAdmin@20.125.24.28

# Create SSH directory (if it doesn't exist)
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add your public key to authorized_keys
echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDABNvgowdtSKJQeY5nRP+Y+/GXTR/AqEWbrPeRrKnLvBbhW6c3LHvcyjJ9e+5c1GpJbBU1rtH2VHDZUcOQ62yBun8PkHT0/VbGn9waqEb7BdJypG+LP5rC6KLUEOrLFxqj9gXJMDeGNRAMmaaXil9FSilkJzWI+MiOOC5NPIKO7At8x2hkcX3/+2IhfYckwroYsfCJE3r/UiJHm6Pf1vBrefLqrupdNI6Nqdo9CzIZrry8ZKTiINcyKy7+IKCEm9K0Cv40CQdZucHbc0/6X3yhd3PikRoJ3SbnIzYTtfWNTpNFsLldjsJbT47IJmPGWnyVZ03OruomLQ4EBbOX9MiGBpVr18wrgNUJcCjoayFQPCHXw/tlpWVM+/YniccbfH3808Fz0eFoKNQs4wUq0Ye+gNXAmWQfdt7ML4c6CZWD/1i8+EaTdAmTBLhxNbbA+ceBGT8bWVfQ5WaX78DaHw1IQiM42YlM2AK7chTBhXvMyY0zZJ5F4RlLB4ICvCFTShUNb8XptNWkYM0/JRCTzWmHWxWb1fgi2QkzecDn0f7RjsVx8+5IhvTKhRjo5DAQ7+H7S7etLs1AbcX/JPQ2VUgTSuBlW3Sh7mpysdJ1IJtOALt6qdEsmJWbJLfsxOQeOisuU/BO3dQKTUfpqC0DvbNCa7+iBIJ+2oKk/sLZMh2GEw== NorthpassPP-deployment" >> ~/.ssh/authorized_keys

# Set correct permissions
chmod 600 ~/.ssh/authorized_keys

# Exit server
exit
```

#### **Step 3: Test Passwordless Authentication**
```powershell
# Test from your local machine
ssh -o PasswordAuthentication=no -p 22 NTXPTRAdmin@20.125.24.28 "echo 'Success!'"
```

If this works without asking for a password, you're all set!

### **Method 3: Alternative - Use PuTTY Key (if using PuTTY)**

If you use PuTTY instead of OpenSSH:

1. **Convert key to PuTTY format:**
   ```powershell
   # Install PuTTY tools if needed
   winget install PuTTY.PuTTY
   
   # Convert key
   puttygen ~/.ssh/id_rsa -o ~/.ssh/id_rsa.ppk
   ```

2. **Use Pageant** to load the key automatically

3. **Configure PuTTY** to use the .ppk file

### **Troubleshooting**

#### **If SSH Keys Don't Work:**

1. **Check server SSH configuration** (ask server admin):
   ```bash
   sudo nano /etc/ssh/sshd_config
   
   # Ensure these settings:
   PubkeyAuthentication yes
   AuthorizedKeysFile ~/.ssh/authorized_keys
   PasswordAuthentication yes  # Keep this for backup
   
   # Restart SSH service
   sudo systemctl restart sshd
   ```

2. **Check file permissions on server:**
   ```bash
   ls -la ~/.ssh/
   # Should show:
   # drwx------ (700) for ~/.ssh/
   # -rw------- (600) for ~/.ssh/authorized_keys
   ```

3. **Check SSH debug output:**
   ```powershell
   ssh -v -p 22 NTXPTRAdmin@20.125.24.28
   ```

#### **Alternative: Use SSH Agent**
If keys work but you still get prompted occasionally:
```powershell
# Start SSH agent
Start-Service ssh-agent
Set-Service -Name ssh-agent -StartupType Manual

# Add your key
ssh-add ~/.ssh/id_rsa
```

### **🎉 Once SSH Keys Work:**

You can now deploy without password prompts:
```powershell
# Deploy to production
.\deploy-simple.ps1

# Or use SCP directly
scp -r dist/* NTXPTRAdmin@20.125.24.28:~/northpass-pp/
```

Your deployments will be much faster and more secure! 🚀