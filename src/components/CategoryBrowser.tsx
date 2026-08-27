/**
 * 分类浏览组件 - 用户界面按分类浏览文档
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getCategoriesByDocumentType, type Category } from '@/services/categoryService';
import { getDocuments, searchDocuments } from '@/services/documentApi';
import FilterChipBar from '@/components/knowledge/FilterChipBar';
import KnowledgeDocumentList from '@/components/knowledge/KnowledgeDocumentList';
import {
  ALL_CATEGORY_ID,
  buildCategoryChips,
  filterDocumentsByCategory
} from '@/utils/knowledgeCategoryChips';

/**
 * 将用户界面语言映射到文档语言（仅英文资料）
 */
const mapUILanguageToDocLanguage = (_uiLang: string): 'en' => {
  return 'en';
};

interface CategoryBrowserProps {
  documentType: 'video' | 'general';
  tutorialType?: 'installation' | 'device-operation';
  headUnitTypeId?: string;
  scopeLabel?: string;
  onViewDocument: (doc: any) => void;
  className?: string;
}

const CategoryBrowser: React.FC<CategoryBrowserProps> = ({
  documentType,
  tutorialType,
  headUnitTypeId,
  scopeLabel,
  onViewDocument,
  className = ''
}) => {
  const { t, i18n } = useTranslation();
  const documentLanguage = mapUILanguageToDocLanguage(i18n.language);

  const [categories, setCategories] = useState<Category[]>([]);
  const [allDocuments, setAllDocuments] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(ALL_CATEGORY_ID);
  const [loading, setLoading] = useState(true);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  useEffect(() => {
    setSelectedCategoryId(ALL_CATEGORY_ID);
  }, [documentType, tutorialType, headUnitTypeId, documentLanguage]);

  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      try {
        const matchingCategories = await getCategoriesByDocumentType(
          documentType,
          documentLanguage,
          documentType === 'video' ? tutorialType : undefined
        );
        if (!cancelled) {
          setCategories(matchingCategories);
        }
      } catch (error) {
        console.error('加载分类失败:', error);
        if (!cancelled) {
          setCategories([]);
        }
      }
    };

    loadCategories();
    return () => {
      cancelled = true;
    };
  }, [documentType, documentLanguage, tutorialType]);

  useEffect(() => {
    let cancelled = false;
    const loadDocuments = async () => {
      try {
        setLoading(true);
        setDocumentsLoading(true);
        const result = await getDocuments({
          documentType,
          tutorialType: documentType === 'video' ? tutorialType : undefined,
          headUnitTypeId: documentType === 'video' ? headUnitTypeId : undefined,
          status: 'published',
          language: documentLanguage,
          limit: 1000
        });
        if (!cancelled) {
          setAllDocuments(result.documents);
        }
      } catch (error) {
        console.error('加载文档失败:', error);
        if (!cancelled) {
          setAllDocuments([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setDocumentsLoading(false);
        }
      }
    };

    loadDocuments();
    return () => {
      cancelled = true;
    };
  }, [documentType, documentLanguage, tutorialType, headUnitTypeId]);

  const categoryChips = useMemo(
    () => buildCategoryChips(
      categories,
      allDocuments,
      t('common.all'),
      { scopedToExistingContent: Boolean(headUnitTypeId) }
    ),
    [categories, allDocuments, t, headUnitTypeId]
  );

  const visibleDocuments = useMemo(
    () => filterDocumentsByCategory(allDocuments, selectedCategoryId, categoryChips),
    [allDocuments, selectedCategoryId, categoryChips]
  );

  useEffect(() => {
    if (!categoryChips.some((chip) => chip.id === selectedCategoryId)) {
      setSelectedCategoryId(ALL_CATEGORY_ID);
    }
  }, [categoryChips, selectedCategoryId]);

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      setShowSearchResults(false);
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      const results = await searchDocuments(query, {
        documentType,
        tutorialType: documentType === 'video' ? tutorialType : undefined,
        headUnitTypeId: documentType === 'video' ? headUnitTypeId : undefined,
        limit: 50
      });
      const filteredResults = results.filter(doc => {
        const docLang = (doc as unknown as { language?: string }).language;
        return docLang === documentLanguage || !docLang;
      });
      setSearchResults(filteredResults);
      setShowSearchResults(true);
    } catch (error) {
      console.error('搜索失败:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, documentType, documentLanguage, tutorialType, headUnitTypeId]);

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const toListItems = (docs: any[]) => docs.map((doc) => ({
    id: doc._id,
    title: doc.title,
    description: doc.summary,
    eyebrow: doc.category || (documentType === 'video' ? t('knowledge.videoTutorial') : t('knowledge.generalDocument')),
    meta: doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : undefined,
    onClick: () => onViewDocument(doc)
  }));

  const renderSearchBox = () => (
    <div className="mb-6">
      <div className="relative max-w-md">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={documentType === 'video'
            ? t('category.searchVideos')
            : t('category.searchDocuments')}
          className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-gray-500" />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {searchQuery && (
        <Button
          onClick={handleSearch}
          disabled={isSearching}
          className="mt-2"
          size="sm"
        >
          {isSearching ? t('common.loading') : t('common.search')}
        </Button>
      )}
    </div>
  );

  if (loading && allDocuments.length === 0 && categories.length === 0) {
    return (
      <div className={`text-center text-gray-400 py-12 ${className}`}>
        {t('common.loading')}
      </div>
    );
  }

  if (showSearchResults) {
    return (
      <div className={className}>
        {renderSearchBox()}
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            {t('category.searchResultsFor', { query: searchQuery })} ({searchResults.length})
          </h2>
          <Button variant="outline" onClick={clearSearch} size="sm">
            {t('category.backToCategories')}
          </Button>
        </div>
        <KnowledgeDocumentList
          items={toListItems(searchResults)}
          accent={documentType}
          emptyText={t('category.noSearchResults')}
        />
      </div>
    );
  }

  const emptyText = selectedCategoryId === ALL_CATEGORY_ID
    ? t('category.noRelatedTutorials')
    : (documentType === 'video' ? t('category.noVideosInCategory') : t('category.noDocumentsInCategory'));

  return (
    <div className={className}>
      {renderSearchBox()}

      {scopeLabel ? (
        <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-white">
          {scopeLabel}
        </h2>
      ) : null}

      {categoryChips.length > 1 ? (
        <FilterChipBar
          className="mb-6"
          label={t('category.filterLabel')}
          ariaLabel={t('category.filterLabel')}
          items={categoryChips}
          selectedId={categoryChips.some((chip) => chip.id === selectedCategoryId) ? selectedCategoryId : ALL_CATEGORY_ID}
          onSelect={setSelectedCategoryId}
        />
      ) : null}

      {categories.length === 0 && allDocuments.length === 0 && !documentsLoading ? (
        <p className="py-12 text-center text-sm text-slate-500 dark:text-gray-400">
          {documentType === 'video'
            ? t('category.videoCategoriesComingSoon')
            : t('category.documentCategoriesComingSoon')}
        </p>
      ) : (
        <KnowledgeDocumentList
          items={toListItems(visibleDocuments)}
          accent={documentType}
          loading={documentsLoading}
          loadingText={t('common.loading')}
          emptyText={emptyText}
        />
      )}
    </div>
  );
};

export default CategoryBrowser;
