After running the tests with docker, you will need Docker installed and the docker image downloaded.

## Install docker
`sudo apt install docker.io && sudo usermod -aG docker $(whoami)`

## Download image
`docker pull carto/IMAGE`

## Carto account
https://hub.docker.com/r/carto/

## Update image
- Edit the docker image file with your desired changes
- Build image:
  - `docker build -t carto/IMAGE -f docker/DOCKER_FILE docker/`

- Upload to docker hub:
  - Login into docker hub:
    - `docker login`
  - Create tag:
    - `docker tag carto/IMAGE carto/IMAGE`
  - Upload:
    - `docker push carto/IMAGE`
