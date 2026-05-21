export function NewsFeedLoadingSkeleton() {
  return (
    <main className="nf-boot-loading-screen" aria-busy="true" aria-label="뉴스 불러오는 중">
      <div className="nf-boot-loading-top">
        <div className="nf-boot-brand-row">
          <p className="nf-boot-brand">News Story</p>
        </div>
      </div>

      <div className="nf-boot-loading-bottom" aria-hidden="true">
        <div className="nf-boot-skeleton nf-boot-skeleton-progress" />
      </div>

      <div className="nf-boot-loading-overlay">
        <div className="nf-boot-loading-meta">
          <div className="nf-boot-source-row">
            <div className="nf-boot-skeleton nf-boot-skeleton-publisher" />
          </div>
          <div className="nf-boot-skeleton nf-boot-skeleton-title" />
          <div className="nf-boot-skeleton nf-boot-skeleton-cta" />
        </div>
      </div>
    </main>
  );
}
