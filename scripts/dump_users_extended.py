import psycopg2

def main():
    conn = psycopg2.connect('postgresql://postgres:postgres@localhost:5432/divan')
    with conn, conn.cursor() as cur:
        cur.execute('select id, handle, display_name, campus_id from users')
        for row in cur.fetchall():
            print(row)

if __name__ == '__main__':
    main()
