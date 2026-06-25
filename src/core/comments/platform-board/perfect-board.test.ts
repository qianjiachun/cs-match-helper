import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchPerfectBoardComments } from './perfect-board';
import { fetchHttpJson } from './http';

vi.mock('./http', () => ({
  fetchHttpJson: vi.fn(),
}));

const sampleResponse = {
  code: 0,
  message: 'success',
  result: {
    commentResponse: {
      commentDTOS: [
        {
          commentId: 40814483,
          content: '你只配在完美的帖子上挂lak了',
          createTime: 1778131812000,
          likeCount: 14,
          userRegion: '湖南',
          userName: '350886372',
          userDTO: {
            userName: '350886372',
            avatar: 'https://cdn.wmpvp.com/appactivity/example.jpg',
          },
          replyComments: [
            {
              id: 25880909,
              content: '闹麻了挂呗',
              createTime: 1778132116000,
              likeCount: 1,
              fromUserName: '等着那道光',
              toUserName: '350886372',
              userRegion: '天津',
            },
          ],
          floor: 613,
        },
      ],
      itemCount: 20,
    },
  },
};

describe('fetchPerfectBoardComments', () => {
  beforeEach(() => {
    vi.mocked(fetchHttpJson).mockReset();
  });

  it('maps perfect board comments with replies', async () => {
    vi.mocked(fetchHttpJson).mockResolvedValue(sampleResponse);

    const result = await fetchPerfectBoardComments('58494422');

    expect(fetchHttpJson).toHaveBeenCalledWith(
      expect.stringContaining('entityId=58494422'),
      expect.objectContaining({ Referer: 'https://news.wmpvp.com/' }),
    );
    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toMatchObject({
      id: 'perfect:40814483',
      source: 'perfect',
      readOnly: true,
      authorName: '350886372',
      region: '湖南',
      floor: 613,
    });
    expect(result.list[0]?.replies).toHaveLength(1);
    expect(result.list[0]?.replies?.[0]).toMatchObject({
      text: '闹麻了挂呗',
      replyToName: '350886372',
    });
  });
});
