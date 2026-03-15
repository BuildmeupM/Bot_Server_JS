/**
 * Initial Schema — baseline migration containing all existing tables.
 * This captures the full schema as of 2026-03-15.
 */
exports.up = async function (knex) {
    // Helper: only create if not exists (safe for existing DBs)
    const createIfNotExists = async (name, builder) => {
        if (!(await knex.schema.hasTable(name))) {
            await knex.schema.createTable(name, builder);
        }
    };

    // 1. companies
    await createIfNotExists('companies', (t) => {
        t.increments('id').primary();
        t.string('group_code', 50).notNullable().defaultTo('').comment('รหัสภายใน เช่น Build000');
        t.string('company_name', 255).notNullable().comment('ชื่อบริษัท');
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.timestamp('updated_at').defaultTo(knex.fn.now());
        t.index('group_code', 'idx_group_code');
    });

    // 2. company_codes
    await createIfNotExists('company_codes', (t) => {
        t.increments('id').primary();
        t.integer('company_id').unsigned().notNullable();
        t.enu('code_type', ['account', 'payment']).notNullable().comment('ประเภท');
        t.string('code', 50).notNullable().comment('โค้ด');
        t.string('description', 500).nullable().comment('คำอธิบาย');
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.foreign('company_id').references('companies.id').onDelete('CASCADE');
    });

    // 3. usage_logs
    await createIfNotExists('usage_logs', (t) => {
        t.increments('id').primary();
        t.integer('user_id').nullable().comment('รหัสผู้ใช้ (from JWT)');
        t.string('username', 100).nullable();
        t.string('page', 50).notNullable().comment('หน้าที่เข้า');
        t.string('path_used', 500).nullable();
        t.string('company_code', 100).nullable();
        t.string('company_name', 255).nullable();
        t.string('action', 50).defaultTo('browse');
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.index('company_code', 'idx_company_code');
        t.index('page', 'idx_page');
        t.index('created_at', 'idx_ul_created_at');
    });

    // 4. companies_master
    await createIfNotExists('companies_master', (t) => {
        t.increments('id').primary();
        t.string('tax_id', 20).notNullable().unique();
        t.string('name_th', 255).nullable();
        t.string('name_en', 255).nullable();
        t.text('address').nullable();
        t.boolean('tax_id_valid').defaultTo(false);
        t.boolean('verified').defaultTo(false);
        t.string('source', 50).defaultTo('ocr');
        t.integer('times_seen').defaultTo(1);
        t.timestamp('first_seen_at').defaultTo(knex.fn.now());
        t.timestamp('last_seen_at').defaultTo(knex.fn.now());
        t.timestamp('updated_at').defaultTo(knex.fn.now());
        t.index('tax_id', 'idx_cm_tax_id');
        t.index('verified', 'idx_verified');
        t.index('last_seen_at', 'idx_last_seen');
    });

    // 5. ocr_history
    await createIfNotExists('ocr_history', (t) => {
        t.increments('id').primary();
        t.string('file_name', 500).notNullable();
        t.string('file_path', 1000).nullable();
        t.string('document_type', 100).nullable();
        t.string('document_number', 100).nullable();
        t.string('document_date', 20).nullable();
        t.string('seller_name', 255).nullable();
        t.string('seller_tax_id', 20).nullable();
        t.string('seller_branch', 10).nullable();
        t.text('seller_address').nullable();
        t.string('buyer_name', 255).nullable();
        t.string('buyer_tax_id', 20).nullable();
        t.text('buyer_address').nullable();
        t.string('subtotal', 20).nullable();
        t.string('vat', 20).nullable();
        t.string('total', 20).nullable();
        t.integer('processing_time_ms').nullable();
        t.string('ocr_by', 100).nullable();
        t.string('batch_job_id', 100).nullable();
        t.string('status', 20).defaultTo('done');
        t.string('build_code', 50).nullable();
        t.string('build_name', 255).nullable();
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.timestamp('updated_at').nullable();
        t.index(knex.raw('file_name(255)'), 'idx_file_name');
        t.index('seller_tax_id', 'idx_seller_tax');
        t.index('buyer_tax_id', 'idx_buyer_tax');
        t.index('created_at', 'idx_oh_created_at');
    });

    // 6. bot_credentials
    await createIfNotExists('bot_credentials', (t) => {
        t.string('id', 20).primary();
        t.string('name', 255).notNullable();
        t.string('username', 255).notNullable();
        t.text('password').notNullable();
        t.timestamp('created_at').defaultTo(knex.fn.now());
    });

    // 7. bot_profiles
    await createIfNotExists('bot_profiles', (t) => {
        t.string('id', 20).primary();
        t.string('platform', 100).notNullable();
        t.string('username', 255).notNullable();
        t.text('password').notNullable();
        t.string('software', 100).notNullable();
        t.string('peak_code', 50).nullable();
        t.string('status', 20).defaultTo('idle');
        t.string('last_sync', 100).defaultTo('ไม่เคยทำงาน');
        t.string('vat_status', 20).defaultTo('registered');
        t.timestamp('created_at').defaultTo(knex.fn.now());
    });

    // 8. bot_pdf_configs
    await createIfNotExists('bot_pdf_configs', (t) => {
        t.increments('id').primary();
        t.string('profile_id', 20).notNullable();
        t.string('company_name', 255).nullable();
        t.string('customer_code', 50).nullable();
        t.string('account_code', 50).nullable();
        t.string('payment_code', 50).nullable();
        t.foreign('profile_id').references('bot_profiles.id').onDelete('CASCADE');
    });

    // 9. users
    await createIfNotExists('users', (t) => {
        t.increments('id').primary();
        t.string('username', 100).notNullable().unique();
        t.string('password', 255).notNullable();
        t.string('display_name', 255).nullable();
        t.string('role', 20).defaultTo('user');
        t.timestamp('created_at').defaultTo(knex.fn.now());
    });

    // 10. activity_log
    await createIfNotExists('activity_log', (t) => {
        t.increments('id').primary();
        t.integer('user_id').nullable();
        t.string('action', 50).notNullable();
        t.text('details').nullable();
        t.text('file_path').nullable();
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.index('user_id', 'idx_activity_user');
        t.index('created_at', 'idx_activity_created');
    });

    // 11. app_settings
    await createIfNotExists('app_settings', (t) => {
        t.string('key', 100).primary();
        t.text('value').notNullable();
        t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
};

exports.down = async function (knex) {
    const tables = [
        'app_settings', 'activity_log', 'users',
        'bot_pdf_configs', 'bot_profiles', 'bot_credentials',
        'ocr_history', 'companies_master', 'usage_logs',
        'company_codes', 'companies',
    ];
    for (const table of tables) {
        await knex.schema.dropTableIfExists(table);
    }
};
