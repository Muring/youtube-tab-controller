// content.js
if (window.__ytc) {
  // 이미 실행됨 — 종료
} else {
  window.__ytc = true;

  (function () {
    let autoResumeEnabled = false;

    function isWatchPage() {
      return location.pathname === '/watch' && !!new URLSearchParams(location.search).get('v');
    }

    // 메인 플레이어 video 반환. 없으면 null.
    function getVideo() {
      const v = document.querySelector('#movie_player video');
      if (v && v.readyState >= 1) return v;
      const list = Array.from(document.querySelectorAll('video'))
        .filter(v => v.readyState >= 1 && v.duration > 1);
      if (!list.length) return null;
      return list.reduce((a, b) => a.duration > b.duration ? a : b);
    }

    // ── 자동 재개 ──────────────────────────────
    function installAutoResume(video) {
      if (video._autoResumeInstalled) return;
      video._autoResumeInstalled = true;
      video.addEventListener('pause', () => {
        if (video._extPaused) { video._extPaused = false; return; }
        if (video.ended) return;
        if (!autoResumeEnabled) return;
        setTimeout(() => {
          if (video.paused && !video.ended && !video._extPaused) {
            video.play().catch(() => {});
          }
        }, 300);
      });
    }

    function attachAutoResume() {
      const v = getVideo();
      if (v && isWatchPage()) installAutoResume(v);
    }

    attachAutoResume();
    new MutationObserver(attachAutoResume)
      .observe(document.body, { childList: true, subtree: true });
    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) { lastHref = location.href; attachAutoResume(); }
    }, 800);

    // ── 메시지 핸들러 ───────────────────────────
    chrome.runtime.onMessage.addListener((msg, _sender, respond) => {

      if (msg.action === 'ping') {
        respond({ pong: true });
        return;
      }

      if (msg.action === 'getState') {
        // watch 페이지면 video 로드 여부와 무관하게 found:true 반환
        // → video 미로드 상태(Chrome 재시작 직후 등)에도 팝업에 탭이 표시됨
        if (!isWatchPage()) { respond({ found: false }); return; }

        const v     = getVideo();
        const title =
          document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')
            ?.textContent?.trim() ||
          document.querySelector('h1.style-scope.ytd-watch-metadata yt-formatted-string')
            ?.textContent?.trim() ||
          document.title.replace(/ - YouTube$/, '').trim() ||
          '로딩 중...';

        respond({
          found:       true,
          ready:       !!v,            // video가 실제로 로드됐는지 팝업이 알 수 있게
          paused:      v ? v.paused : true,
          muted:       v ? v.muted  : false,
          currentTime: v ? v.currentTime : 0,
          duration:    v ? v.duration    : 0,
          autoResume:  autoResumeEnabled,
          title,
        });
        return;
      }

      if (msg.action === 'getTime') {
        const v = getVideo();
        if (!v) { respond({ found: false }); return; }
        respond({ found: true, currentTime: v.currentTime, duration: v.duration });
        return;
      }

      if (msg.action === 'play') {
        getVideo()?.play().catch(() => {});
        respond({ ok: true });
        return;
      }

      if (msg.action === 'pause') {
        const v = getVideo();
        if (v) { v._extPaused = true; v.pause(); }
        respond({ ok: true });
        return;
      }

      if (msg.action === 'setAutoResume') {
        autoResumeEnabled = !!msg.enabled;
        respond({ ok: true, autoResume: autoResumeEnabled });
        return;
      }

      if (msg.action === 'toggleMute') {
        const v = getVideo();
        if (v) v.muted = !v.muted;
        respond({ ok: true, muted: v?.muted ?? false });
        return;
      }

      if (msg.action === 'nextVideo') {
        // YouTube 플레이어의 다음 버튼 클릭
        const btn = document.querySelector('.ytp-next-button');
        if (btn) btn.click();
        respond({ ok: true });
        return;
      }

      if (msg.action === 'prevVideo') {
        // 재생 위치가 3초 이상이면 처음으로, 아니면 이전 영상
        const v = getVideo();
        if (v && v.currentTime > 3) {
          v.currentTime = 0;
        } else {
          // 재생목록의 이전 버튼 (없으면 처음으로)
          const prev = document.querySelector('.ytp-prev-button');
          if (prev && !prev.disabled) prev.click();
          else if (v) v.currentTime = 0;
        }
        respond({ ok: true });
        return;
      }

      if (msg.action === 'skip') {
        const v = getVideo();
        if (v) v.currentTime = Math.max(0, Math.min(v.currentTime + msg.seconds, v.duration));
        respond({ ok: true });
        return;
      }

      if (msg.action === 'seek') {
        const v = getVideo();
        if (v) v.currentTime = Math.max(0, Math.min(msg.to, v.duration));
        respond({ ok: true });
        return;
      }
    });

  })();
}
