MUNIN_PLUGINS_DIR=/etc/munin/plugins
MUNIN_PLUGINS_CONFIG_DIR=/etc/munin/plugin-conf.d
PWD=$(shell pwd)

all: windshaft.conf

windshaft.conf: windshaft.conf.in
	sed 's#@PWD@#$(PWD)#' < $< > $@

install-munin-plugin-conf: windshaft.conf 
	install -m 644 $< $(MUNIN_PLUGINS_CONFIG_DIR)/windshaft.conf

install-munin-plugin: windshaft
	install -m 755 $< $(MUNIN_PLUGINS_DIR)/windshaft

install: install-munin-plugin install-munin-plugin-conf

clean:
	rm -f windshaft.conf
