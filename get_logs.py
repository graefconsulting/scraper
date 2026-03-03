import paramiko
import sys

host = "72.61.80.21"
username = "root"
password = "1###TestserverPassword!!!"

# The user mentioned a new password but let's try the one from the earlier script first, or if the user explicitly provided DanielaVeit25?, let's use that.
password_provided = "DanielaVeit25?"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    print(f"Connecting to {host}...")
    client.connect(hostname=host, username=username, password=password_provided, banner_timeout=200)
    print("Connected successfully!")
    
    print("Running: docker compose logs -n 100 backend")
    stdin, stdout, stderr = client.exec_command("cd /root/scraper && docker compose logs -n 100 backend")
    
    output = stdout.read().decode('utf-8')
    error = stderr.read().decode('utf-8')
    
    if output:
        print("\n--- STDOUT ---\n")
        print(output)
    if error:
        print("\n--- STDERR ---\n")
        print(error)
        
except Exception as e:
    print(f"Connection or execution failed: {e}")
finally:
    client.close()
