import { describe, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import type { Info } from 'csv-parse';

type Parsed = { record: Record<string, string>; info: Info };

function parseWithInfo(text: string): Parsed[] {
  return parse(text, {
    bom: true,
    info: true,
    columns: true,
    skip_empty_lines: true,
  }) as unknown as Parsed[];
}

describe('csv-parse info.lines', () => {
  it('numbers the first data row 2 when a header is consumed', () => {
    const parsed = parseWithInfo('a,b\n1,2\n3,4\n');

    expect(parsed.map(({ info }) => info.lines)).toEqual([2, 3]);
  });

  it('reports the end line of a record containing a quoted newline', () => {
    const parsed = parseWithInfo('a,b\n"multi\nline",2\n3,4\n');

    expect(parsed[0].record.a).toBe('multi\nline');
    expect(parsed.map(({ info }) => info.lines)).toEqual([3, 4]);
  });

  it('strips a leading UTF-8 BOM from the first column name', () => {
    const parsed = parseWithInfo('﻿a,b\n1,2\n');

    expect(Object.keys(parsed[0].record)).toEqual(['a', 'b']);
  });
});
