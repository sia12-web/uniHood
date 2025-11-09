import psycopg2

def main():
    conn = psycopg2.connect('postgresql://postgres:postgres@localhost:5432/divan')
    with conn, conn.cursor() as cur:
        cur.execute('select id, avatar_url, avatar_key from users limit 10')
        for row in cur.fetchall():
            print(row)

if __name__ == '__main__':
    main()
