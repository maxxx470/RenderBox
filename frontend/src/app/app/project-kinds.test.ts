import { describe, it, expect } from 'vitest';
import { imageHref, imageTypeOf, kindOf, projectHref } from './project-kinds';

describe('kindOf', () => {
  it('counts a project with no render yet as an image project', () => {
    expect(kindOf([])).toBe('image');
  });

  it('reads a project of enhancements only as an Enhance project', () => {
    expect(kindOf([{ editType: 'enhance' }, { editType: 'enhance' }])).toBe('enhance');
  });

  it('keeps an image project that was also enhanced among the images', () => {
    expect(kindOf([{ editType: null }, { editType: 'enhance' }])).toBe('image');
    expect(kindOf([{ editType: 'annotate' }, { editType: 'enhance' }])).toBe('image');
  });
});

describe('projectHref', () => {
  it('opens an image project in the editor', () => {
    expect(projectHref('p1', 'image', { id: 'n2', parentId: 'n1' })).toBe('/app/p1');
  });

  it('opens an Enhance project on the Enhance page, on its latest result', () => {
    expect(projectHref('p1', 'enhance', { id: 'n2', parentId: 'n1' })).toBe(
      '/app/enhance?projet=p1&image=n1&resultat=n2',
    );
  });

  it('falls back to an empty Enhance page when the source is unknown', () => {
    expect(projectHref('p1', 'enhance', { id: 'n2', parentId: null })).toBe('/app/enhance');
    expect(projectHref('p1', 'enhance', null)).toBe('/app/enhance');
  });
});

describe('imageTypeOf', () => {
  it('files uploads, renders and enhancements apart', () => {
    expect(imageTypeOf({ kind: 'UPLOADED', editType: null })).toBe('uploaded');
    expect(imageTypeOf({ kind: 'GENERATED', editType: null })).toBe('generated');
    expect(imageTypeOf({ kind: 'GENERATED', editType: 'annotate' })).toBe('generated');
    expect(imageTypeOf({ kind: 'GENERATED', editType: 'enhance' })).toBe('enhance');
  });
});

describe('imageHref', () => {
  const result = { id: 'n2', projectId: 'p1', parentId: 'n1', kind: 'GENERATED' };
  const photo = { id: 'n1', projectId: 'p1', parentId: null, kind: 'UPLOADED' };

  it('opens an image of an image project in the editor, on that image', () => {
    expect(imageHref(result, 'image')).toBe('/app/p1?node=n2');
    expect(imageHref(photo, 'image')).toBe('/app/p1?node=n1');
  });

  it('opens an Enhance result against its photo, and the photo alone', () => {
    expect(imageHref(result, 'enhance')).toBe('/app/enhance?projet=p1&image=n1&resultat=n2');
    expect(imageHref(photo, 'enhance')).toBe('/app/enhance?projet=p1&image=n1');
  });
});
