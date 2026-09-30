# Oracle ARM VM

Stay at or under 2 OCPUs and 12 GB. That is the current Always Free allowance.

1. Create an Ampere A1 instance (`VM.Standard.A1.Flex`) with a public IP. Ubuntu or Oracle Linux, aarch64.
2. Open ports 22, 80, and 443 in the Oracle security list and in the OS firewall.
3. Install Temurin 21 for aarch64.
4. Copy `chippy-api/target/chippy.war` to the VM. The same file runs with `java -jar`.
5. Install the unit below so it starts on boot. It listens on port 8080, on localhost only.
6. Put Caddy or nginx on 443 and forward to `127.0.0.1:8080`.

If creation fails with "out of host capacity", try another availability domain.

```
# /etc/systemd/system/chippy.service
[Unit]
Description=Chippy
After=network.target

[Service]
User=chippy
Environment=CHIPPY_SPLASH_ENABLED=true
ExecStart=/usr/bin/java -jar /opt/chippy/chippy.war --server.address=127.0.0.1
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Traditional WebSphere Application Server 8.5 and 9 cannot run this WAR. WebSphere Liberty can. See `deploy/liberty/server.xml`.
