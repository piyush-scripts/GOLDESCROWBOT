CREATE TABLE users (
    seller_user_id bigint,
    buyer_user_id bigint,
    group_id bigint,
    seller_btc_address text,
    buyer_btc_address text,
    escrow_btc_address text,
    escrow_private_key text);