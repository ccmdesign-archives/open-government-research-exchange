$(function() {
    var index, papers, scopes, scopedIndices = {};

    var slug = function (t) {
      return t ? t.toString().toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '')
      : false ;
  }

  var getx = function (arr, prop, needle) {
    console.log (prop, needle);
    for (var i in arr) {
        if (arr[i][prop] === needle) {
            console.log(arr[i]);
            return arr[i];
        }
    }
};

var mapResults = function (fromHaystack, toHaystack, mapFrom, mapTo) {
    var results = [];
    for (var i in fromHaystack) {
        console.log (fromHaystack, mapFrom, fromHaystack[i][mapFrom]);
        results.push(getx(toHaystack, mapTo, fromHaystack[i][mapFrom]));
    }
    return results;
}

$.get( 'js/searchindex.json', function( d ) {
    index = lunr.Index.load(d.index);
})
.fail(function() {
    $( '.b-lunr-results' ).text( 'Could not get searchindex.json' );
});

    // get scoped indicies ///////////////////

    $.get( 'js/scopes.json', function( d ) {
        scopes = d;

        for (var s in scopes) {
            scopes[s].custom_filter &&
            getIndex(slug(scopes[s].custom_filter));
        }
    })
    .fail(function() {
        console.log ('couldnt get available scopes!');
    });

    var getIndex = function (name) {
        $.get( 'js/searchindex-' + name + '.json', function( d ) {
            scopedIndices[name] = lunr.Index.load(d.index);
        })
        .fail(function() {
            console.log('couldnt $.get scoped index : ' + name);
        });
    }


    //////////////////////////////////////////

    $.get( 'js/searchindex.json', function( d ) {
        papers = d.papers;
    })
    .fail(function() {
        $( '.b-lunr-results' ).text( 'Could not get papers.json' );
    });

    var search = function (e) {
        var mapping = mapResults(index.search($(this).val()), papers, 'ref', 'id'), resultsHTML = '';

        for (var m in mapping) {
            resultsHTML += '<div class="b-search-result">\n<h3>'
            + mapping[m].title
            + '</h3>\n<p></div>'
            + mapping[m].abstract.substring(0, 250)
            + '... </p>';
        }

        $( '.b-lunr-results' ).html(resultsHTML);
    };

    var filter = function (e) {
        // $( '.b-lunr-results' ).text( JSON.stringify(index.search($('#lunr-search').val())) );


        var results = scopedIndices[$(this).attr('data-category')].search($(this).val()),
        limit = 50;

        // console.log ($(this).attr('data-category'), $(this).val(), results, scopedIndices[$(this).attr('data-category')]);

        if (results.length > limit) {
            results = results.slice(0, limit);
        }

        $( document ).trigger( 'filter:removeClassesContaining', [ 'f-search-' ] );

        for (var r in results) {
            if (r == 0) {
                $( document ).trigger( 'filter:add', [ '.f-search-' + results[r].ref ] );
            } else {
                $( document ).trigger( 'filter:addOR', [ '.f-search-' + results[r].ref ] );
            }
        }

        $( document ).trigger( 'filter:update' );

    }

    var debouncedSearch = _.debounce(search, 100, false);
    var debouncedFilter = _.debounce(filter, 1000, false);

    $('#lunr-search').keyup(debouncedSearch);
    $('#lunr-filter').keyup(debouncedFilter);

});