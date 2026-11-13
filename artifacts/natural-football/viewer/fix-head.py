import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
head = '<!doctype html>\n<html lang="ko">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
if not s.startswith('<!doctype'):
    open(p, 'w', encoding='utf-8').write(head + s)
print('ok', p)
