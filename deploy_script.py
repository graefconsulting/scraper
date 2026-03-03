import paramiko
import time

host = "82.197.82.100"
username = "root"
password = "1###TestserverPassword!!!"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    print(f"Connecting to {host}...")
    client.connect(hostname=host, username=username, password=password)
    print("Connected successfully.")

    # Execute git pull and docker compose up -d
    commands = [
        "cd /root/scraper && git pull",
        "cd /root/scraper && docker compose up -d --build"
    ]

    for cmd in commands:
        print(f"\nExecuting: {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd)
        
        # Wait for command to finish and print output
        exit_status = stdout.channel.recv_exit_status()
        
        out = stdout.read().decode('utf-8')
        err = stderr.read().decode('utf-8')
        
        if out:
            print("Output:")
            print(out)
        if err:
            print("Error/Warning:")
            print(err)
            
        print(f"Command finished with exit status: {exit_status}")

finally:
    client.close()
    print("\nConnection closed.")
