-- PostgreSQL Schema for Render Managed Postgres
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    pin_hash VARCHAR(255) NOT NULL,
    upi_id VARCHAR(100),
    avatar VARCHAR(10) DEFAULT '🦁',
    is_admin BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    is_disabled BOOLEAN DEFAULT FALSE,
    push_subscription JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_history (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(15) NOT NULL,
    banker_name VARCHAR(50) NOT NULL,
    total_pot INT NOT NULL,
    total_expenses INT NOT NULL,
    fair_expense_share NUMERIC(10,2) NOT NULL,
    summary_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
