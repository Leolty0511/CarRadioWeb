import React from 'react'
import { useTranslation } from 'react-i18next'
import '@/styles/car-radio-video-frame.css'

interface CarRadioVideoFrameProps {
  embedUrl: string | null
  isLocalVideo: boolean
  title: string
  sourceUrl: string
}

const CarRadioVideoFrame: React.FC<CarRadioVideoFrameProps> = ({
  embedUrl,
  isLocalVideo,
  title,
  sourceUrl,
}) => {
  const { t } = useTranslation()

  return (
    <div className="cr13-stage">
      <div className="cr13" aria-label={t('knowledge.video.carRadioScreenLabel')}>
        <span className="cr13__port cr13__port--rst" aria-hidden="true">RST</span>
        <span className="cr13__port cr13__port--mic" aria-hidden="true">MIC</span>
        <div className="cr13__screen">
          {embedUrl ? (
            isLocalVideo ? (
              <video
                controls
                playsInline
                className="cr13__media"
                aria-label={title}
              >
                <source src={embedUrl} type="video/mp4" />
                <source src={embedUrl} type="video/webm" />
                {t('knowledge.video.browserNotSupported')}
              </video>
            ) : (
              <iframe
                src={embedUrl}
                title={title}
                className="cr13__media"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            )
          ) : (
            <div className="cr13__fallback">
              <p>{t('knowledge.video.cannotParseLink')}</p>
              {sourceUrl ? (
                <button
                  type="button"
                  className="cr13__fallback-button"
                  onClick={() => window.open(sourceUrl, '_blank', 'noopener,noreferrer')}
                >
                  {t('knowledge.video.openVideoInNewWindow')}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CarRadioVideoFrame
