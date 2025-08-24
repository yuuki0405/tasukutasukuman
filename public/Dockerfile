# ベースイメージに PHP + Apache を使用
FROM php:8.2-apache

# mod_rewrite 有効化
RUN a2enmod rewrite

# PHPファイルを Apache 公開ディレクトリにコピー
COPY . /var/www/html/

# 権限調整
RUN chown -R www-data:www-data /var/www/html

# Render の PORT に合わせて Apache の設定を書き換え
RUN sed -i 's/80/${PORT}/g' /etc/apache2/sites-available/000-default.conf && \
    sed -i 's/80/${PORT}/g' /etc/apache2/ports.conf

# Apache をフォアグラウンドで起動
CMD ["apache2-foreground"]
