import psycopg2
DSN='postgresql://postgres:postgres@localhost:5432/divan'
conn=psycopg2.connect(DSN)
with conn:
    with conn.cursor() as cur:
        cur.execute("select id, campus_id from users limit 1")
        row=cur.fetchone()
        if row:
            print(f"{row[0]} {row[1]}")
        else:
            print("NONE")
