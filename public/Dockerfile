# ベースイメージに PHP + Apache を使用
FROM php:8.2-apache

# Apacheのmod_rewriteが必要なら有効化
RUN a2enmod rewrite

# PHPファイルをApache公開ディレクトリにコピー
COPY . /var/www/html/

# 権限を整える（必要に応じて）
RUN chown -R www-data:www-data /var/www/html
