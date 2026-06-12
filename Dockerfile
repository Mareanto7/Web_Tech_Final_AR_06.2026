FROM ubuntu:latest
LABEL authors="anto"

ENTRYPOINT ["top", "-b"]