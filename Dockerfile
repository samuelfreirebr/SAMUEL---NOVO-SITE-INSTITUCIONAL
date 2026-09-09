FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY global     /usr/share/nginx/html/global
COPY styles     /usr/share/nginx/html/styles
COPY js         /usr/share/nginx/html/js
COPY fonts      /usr/share/nginx/html/fonts
COPY img        /usr/share/nginx/html/img

EXPOSE 80
