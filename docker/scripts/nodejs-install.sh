export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

if [ -z $NODEJS_VERSION ]; then
    NODEJS_VERSION="10"
    NODEJS_VERSION_LTS="--lts"
fi

nvm install $NODEJS_VERSION $NODEJS_VERSION_LTS
nvm alias default $NODEJS_VERSION
nvm use default

/etc/init.d/postgresql start
