var gutil = require('gulp-util');
var extend = require('util-extend');
var mapValues = require('lodash.mapvalues');
var sort = require('sort-object');
var through = require('through2');
var util = require('util');

var expand = require('expand-hash');
var frontmatter = require('front-matter');
var marked = require('marked');

var NAME = 'gulp-markdown-to-json';
var PluginError = gutil.PluginError;
var streamingErr = new PluginError(NAME, 'Streaming not supported');
var rendererErr = new PluginError(NAME, 'Must provide a Markdown rendering function that accepts a string of raw Markdown as a first argument');

function parse( markdown, file, flatten ){
  if( file.isNull() ) return;
  if( file.isStream() ) return this.emit('error', streamingErr);

  if( file.isBuffer() ){
    var path = file.relative.split('.').shift().replace(/\//g, '.');
    var parsed = frontmatter(file.contents.toString());

    var body = parsed.body.split(/\n/);

    function renderProperties (obj) {
      if (!obj || Object.keys(obj).length === 0) return obj;

      obj = mapValues(obj, function (val) {
        if (typeof val !== 'string') return val;
        return markdown.renderInline(val);
      });

      Object.keys(obj).forEach(function (prop) {
        if (!Array.isArray(obj[prop])) return;
        obj[prop] = obj[prop].map(function (item) {
          return renderProperties(item);
        });
      });

      return obj;
    }

    parsed.attributes = renderProperties(parsed.attributes);

    var markup = markdown.render(parsed.body).split(/\n/);

    var title = markup[0].substr(0,3) === '<h1'
      ? body[0]
      : false;

    var data = {};
    data[path] = parsed.attributes;

    if( title && !data[path].title ){
      data[path].title = (title.substr(0,1) === '#')
        ? title.substr(2)
        : title;
      data[path].body = markup.slice(1).join(' ');
    } else {
      data[path].body = markdown.render(parsed.body);
    }

    if( flatten ) data = data[path];

    file.path = gutil.replaceExtension(file.path, '.json');
    file.contents = new Buffer( JSON.stringify(data) );

    return file;
  }
}

module.exports = function( renderer, config ){
  //if( !renderer || typeof renderer !== 'function' ) return this.emit('error', rendererErr);

  //console.log(renderer);

  var stream = through.obj(function( input, enc, callback ){
    var file;

    if( util.isArray(input) ){
      var data = {};

      input.forEach(function( file ){
        var file_data = JSON.parse( renderer, parse(file).contents.toString() );

        data = extend(file_data, data);
      });

      var tree = sort(expand(data));
      var json = JSON.stringify(tree);

      var name = config && typeof config === 'string'
        ? config
        : 'content.json';

      file = new gutil.File({
        base: '/',
        cwd: '/',
        path: '/' + name,
        contents: new Buffer(json)
      });
    } else {
      file = parse(renderer, input, true);
    }

    this.push(file);
    callback();
  });

  return stream;
};
