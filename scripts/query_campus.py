import psycopg2, sys
DSN='postgresql://postgres:postgres@localhost:5432/divan'
user_id = sys.argv[1]
conn=psycopg2.connect(DSN)
with conn:
    with conn.cursor() as cur:
        cur.execute("select campus_id from users where id=%s", (user_id,))
        row=cur.fetchone()
        print(row[0] if row else 'NOT_FOUND')
