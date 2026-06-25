import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetch5eBoardComments } from './5e-board';
import { fetchHttpJson } from './http';

vi.mock('./http', () => ({
  fetchHttpJson: vi.fn(),
}));

const sampleResponse = {
  success: true,
  errcode: 0,
  data: {
    list: [
      {
        comment_id: '2444988',
        content: '炸鱼的？？？',
        dateline: '1584302815',
        likes: '0',
        floor: 0,
        ip: '山西',
        user_data: {
          username: '别骂我了有人看的',
          avatar_url: 'https://oss-arena.5eplay.com/images/award/33b948c482c870ac0ab0b18a728c3afc.jpg',
        },
        children: null,
      },
    ],
    has_more: 0,
    total: 0,
  },
};

describe('fetch5eBoardComments', () => {
  beforeEach(() => {
    vi.mocked(fetchHttpJson).mockReset();
  });

  it('maps 5E board comments', async () => {
    vi.mocked(fetchHttpJson).mockResolvedValue(sampleResponse);

    const result = await fetch5eBoardComments('4636458vqgojt');

    expect(fetchHttpJson).toHaveBeenCalledWith(
      expect.stringContaining('from_id=4636458vqgojt'),
      expect.objectContaining({ Referer: 'https://app.5eplay.com/' }),
    );
    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toMatchObject({
      id: '5e:2444988',
      text: '炸鱼的？？？',
      source: '5e',
      readOnly: true,
      authorName: '别骂我了有人看的',
      region: '山西',
    });
  });
});
