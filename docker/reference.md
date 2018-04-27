After running the tests with docker, you will need Docker installed and the docker image downloaded.

## Install docker
`sudo apt install docker.io && sudo usermod -aG docker $(whoami)`

## Download image
`docker pull cartoimages/engine-xenial-pg101`

## Update image
- Edit the docker image file with your desired changes
- Build image: 
  - `docker build -t cartoimages/engine-xenial-pg101 -f docker/Dockerfile-xenial-pg101 docker/`
- Upload to docker hub:
  - Login into docker hub: 
    - `docker login`
  - Create tag: 
    - `docker tag cartoimages/engine-xenial-pg101 cartoimages/engine-xenial-pg101`
  - Upload: 
    - `docker push cartoimages/engine-xenial-pg101`


## Useful commands 
We have some useful commands created in package.json