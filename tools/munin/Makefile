MUNIN_PLUGINS_DIR=/etc/munin/plugins
MUNIN_PLUGINS_CONFIG_DIR=/etc/munin/plugin-conf.d
PWD=$(shell pwd)

all: windshaft_fds.conf

windshaft_fds.conf: windshaft_fds.conf.in
	sed 's#@PWD@#$(PWD)#' < $< > $@

install-munin-plugin: windshaft_fds.conf
	install -m 644 windshaft_fds.conf $(MUNIN_PLUGINS_CONFIG_DIR)/windshaft_fds.conf
	install -m 755 ../checkfds.sh $(MUNIN_PLUGINS_DIR)/windshaft_fds

install: install-munin-plugin

clean:
	rm -f windshaft_fds.conf
