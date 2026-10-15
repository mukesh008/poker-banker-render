-- PostgreSQL Schema for Render Managed Postgres
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    pin_hash VARCHAR(255) NOT NULL,
    upi_id VARCHAR(100),
    is_admin BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(10) UNIQUE NOT NULL,
    banker_id INT REFERENCES users(id),
    base_buyin_cash INT NOT NULL DEFAULT 500,
    base_starting_chips INT NOT NULL DEFAULT 1000,
    rate_per_chip NUMERIC(10, 4) NOT NULL DEFAULT 0.5000,
    chip_config JSONB NOT NULL DEFAULT '[{"color":"White","chipValue":10,"colorHex":"#f8fafc"},{"color":"Red","chipValue":25,"colorHex":"#ef4444"},{"color":"Blue","chipValue":50,"colorHex":"#3b82f6"},{"color":"Green","chipValue":100,"colorHex":"#22c55e"}]'::jsonb,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    game_id INT REFERENCES games(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id),
    amount_cash INT NOT NULL,
    amount_chips INT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    game_id INT REFERENCES games(id) ON DELETE CASCADE,
    payer_id INT REFERENCES users(id),
    title VARCHAR(120) NOT NULL,
    amount INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cashouts (
    id SERIAL PRIMARY KEY,
    game_id INT REFERENCES games(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id),
    chip_counts JSONB NOT NULL,
    total_chips INT NOT NULL,
    cash_value NUMERIC(10, 2) NOT NULL,
    net_pnl NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
