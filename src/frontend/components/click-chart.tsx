/** @jsxImportSource react */
import { type DailyClick, formatMonthDay, pickChartMax } from '@/frontend/lib/click-stats'

type ClickChartProps = {
  // 日付順に連続した日別クリック数(クリックの無い日は0で含める)
  series: DailyClick[]
  // スクリーンリーダー向けの説明(例: 「直近30日の日別クリック数の棒グラフ」)
  label: string
}

// グラフの描画領域(viewBox)の大きさ。実際の表示幅は親の幅に合わせて伸縮する
const CHART_WIDTH = 892
const CHART_HEIGHT = 180
// 棒どうしの間隔の割合(1本ぶんの幅のうち、棒が占める割合)
const BAR_FILL_RATIO = 0.73

// 横軸に出す日付ラベルの数(先頭・末尾を含めて等間隔に選ぶ)
const X_AXIS_LABEL_COUNT = 4

// ClickChart: 日別クリック数の棒グラフ(docs/mocks/LinkDetail.html)。外部ライブラリは使わず、
// SVGで描く。色はglobal.cssのクラス(第2層のトークン)で指定する。
// 数値の読み取りは同じ画面の「表形式で見る」でも行えるため、SVG自体はrole="img"で説明のみ付ける
export function ClickChart({ series, label }: ClickChartProps) {
  const chartMax = pickChartMax(Math.max(0, ...series.map((item) => item.clicks)))
  const barStep = CHART_WIDTH / series.length
  const barWidth = barStep * BAR_FILL_RATIO

  // 横軸ラベル: 先頭から末尾までを等間隔に選ぶ。系列が短い場合は重複を除く
  const labelIndexes = Array.from(
    new Set(Array.from({ length: X_AXIS_LABEL_COUNT }, (_, i) => Math.round((i * (series.length - 1)) / (X_AXIS_LABEL_COUNT - 1)))),
  )

  return (
    <div className="click-chart">
      <div className="click-chart__y-axis" aria-hidden="true">
        <span>{chartMax}</span>
        <span>{chartMax / 2}</span>
        <span>0</span>
      </div>
      <div className="click-chart__plot">
        <svg
          className="click-chart__svg"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
        >
          <line className="click-chart__grid" x1="0" x2={CHART_WIDTH} y1={CHART_HEIGHT / 2} y2={CHART_HEIGHT / 2} />
          <line className="click-chart__grid" x1="0" x2={CHART_WIDTH} y1="0" y2="0" />
          {series.map((item, index) => {
            const barHeight = (item.clicks / chartMax) * CHART_HEIGHT
            return (
              <rect
                key={item.day}
                className="click-chart__bar"
                x={index * barStep}
                y={CHART_HEIGHT - barHeight}
                width={barWidth}
                height={barHeight}
              >
                <title>{`${formatMonthDay(item.day)}: ${item.clicks}回`}</title>
              </rect>
            )
          })}
          <line className="click-chart__axis" x1="0" x2={CHART_WIDTH} y1={CHART_HEIGHT} y2={CHART_HEIGHT} />
        </svg>
        <div className="click-chart__x-axis" aria-hidden="true">
          {labelIndexes.map((index) => (
            <span key={series[index].day}>{formatMonthDay(series[index].day)}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
